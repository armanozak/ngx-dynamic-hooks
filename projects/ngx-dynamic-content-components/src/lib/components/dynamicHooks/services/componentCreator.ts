import { ComponentFactoryResolver, ComponentRef, Injector, ApplicationRef, SimpleChange, isDevMode, Injectable, ChangeDetectorRef, Renderer2, RendererFactory2 } from '@angular/core';
import { Observable, combineLatest, ReplaySubject, Subject, of } from 'rxjs';
import { map, first, mergeMap, tap, catchError } from 'rxjs/operators';

import { Hook, HookIndex } from '../../../interfaces';
import { DynamicContentChildren, ComponentConfig, LazyLoadComponentConfig } from '../../../interfacesPublic';
import { OutletOptions } from '../options/options';
import { ComponentUpdater } from './componentUpdater';


@Injectable()
export class ComponentCreator {
  private renderer: Renderer2;

  // Component creation
  // ----------------------------------------------------------------------------------------------------------------

  constructor(private injector: Injector, private cfr: ComponentFactoryResolver, private appRef: ApplicationRef, private rendererFactory: RendererFactory2, private componentUpdater: ComponentUpdater) {
    this.renderer = this.rendererFactory.createRenderer(null, null);
  }

  /**
   * The main entry function to start the dynamic component initialization process
   *
   * @param hostElement - The host element with the component selector tags in its innerHTML
   * @param hookIndex - The current hookIndex (ids must match component selector ids)
   * @param token - The token used for parsetoken-attribute of the component selectors
   * @param context - The current context
   * @param cfr - The ComponentFactoryResolver responsible for the components to load
   * @param injector - The injector to give to the loaded components
   * @param appRef - The global ApplicationRef
   * @param options - The current HookComponentOptions
   */
  init(hostElement: HTMLElement, hookIndex: HookIndex, token: string, context: {[key: string]: any}, options: OutletOptions): ReplaySubject<boolean> {
    const allComponentsLoaded: ReplaySubject<boolean> = new ReplaySubject(1);
    const componentLoadSubjects = [];
    const hookPlaceholders = {};

    // Get HookData and create content slots
    for (const [hookId, hook] of Object.entries(hookIndex)) {
      const placeholderElement = hostElement.querySelector('[parsetoken="' + token + '"][hookid="' + hookId + '"]');
      if (placeholderElement) {
        hookPlaceholders[hookId] = placeholderElement;
        hook.data = hook.parser.loadHook(hook.id, hook.value, context, Array.prototype.slice.call(placeholderElement.childNodes));

        // Replace child nodes with all desired ng-content slots
        // Doing this immediately after the evaluation of each hook so that succeeding hooks that are
        // removed by the previous' hooks ng-content don't even need to be evaluated (let alone loaded below)
        this.createContentSlotElements(placeholderElement, hook, token);
      } else {
        // If removed by previous hook in loop via ng-content replacement
        delete hookIndex[hook.id];
      }
    }

    // Load all components in hookIndex from HookData
    for (const [hookId, hook] of Object.entries(hookIndex)) {
      const placeholderElement = hookPlaceholders[hookId];

      componentLoadSubjects.push(of(true) // To have the obs stream handle errors from loadComponentClass as well
        // 1. Load component class first (might be lazy-loaded)
        .pipe(mergeMap(() => this.loadComponentClass(hook.data.component, context, placeholderElement, options)))
        // 2. Replace placeholder
        .pipe(map((compClass) => {
          return {c: compClass, e: this.replacePlaceholderElement(compClass, placeholderElement)};
        }))
        // 3. Instantiate component
        .pipe(tap(({c: compClass, e: componentHostElement}) => {
          this.createComponent(hook, context, componentHostElement, options, compClass, token);
        }))
        // If could not be created, remove from hookIndex
        .pipe(catchError((e) => {
          if (isDevMode()) {
            console.error(e.message);
          }
          delete hookIndex[hook.id];
          return of(null);
        })));
    }

    // If no components in text, no need to progress further
    if (componentLoadSubjects.length === 0) {
      allComponentsLoaded.next(true);
      return allComponentsLoaded;
    }

    // Once all normal and lazy components have loaded
    combineLatest(...componentLoadSubjects).pipe(first()).subscribe(() => {
      console.log(hookIndex);

      // Call dynamic lifecycle methods for all created components
      for (const hook of Object.values(hookIndex)) {
        // Find all content children components
        const contentChildren: Array<DynamicContentChildren> = [];
        if (typeof hook.componentRef.instance['onDynamicMount'] === 'function' || typeof hook.componentRef.instance['onDynamicChanges'] === 'function') {
          this.findContentChildren(hook.componentRef.location.nativeElement, contentChildren, hookIndex);
        }

        // OnDynamicChanges
        if (typeof hook.componentRef.instance['onDynamicChanges'] === 'function') {
          hook.componentRef.instance['onDynamicChanges']({contentChildren});
        }

        // OnDynamicMount
        if (typeof hook.componentRef.instance['onDynamicMount'] === 'function') {
          hook.componentRef.instance['onDynamicMount']({context, contentChildren});
        }
      }

      // Remove now redundant attributes from component elements
      const componentElements = hostElement.querySelectorAll('[hookid][parsetoken="' + token + '"]');
      componentElements.forEach((componentElement, key) => {
        this.renderer.removeAttribute(componentElement, 'hookid');
        this.renderer.removeAttribute(componentElement, 'parsetoken');
        this.renderer.removeAttribute(componentElement, 'parser');
        this.renderer.removeAttribute(componentElement, 'ng-version');
      });

      // Done!
      allComponentsLoaded.next(true);
    });

    return allComponentsLoaded;
  }

  createContentSlotElements(placeholderElement: Element, hook: Hook, token: string): void {
    let content;

    // If content is defined, overwrite child nodes
    if (hook.data.hasOwnProperty('content') && Array.isArray(hook.data.content)) {
      content = hook.data.content;
    // Otherwise just wrap existing content into single content slot
    } else {
      content = [Array.prototype.slice.call(placeholderElement.childNodes)];
    }

    // Empty child nodes
    // Note: Not sure why, but renderer.removeChild() does not work here. Fallback on native method.
    placeholderElement.childNodes.forEach(childNode => placeholderElement.removeChild(childNode));

    // Insert new ones
    let slotIndex = 0;
    for (const contentSlot of content) {
      if (contentSlot !== undefined && contentSlot !== null) {
        const contentSlotElement = this.renderer.createElement('dynamic-component-placeholder-contentslot');
        this.renderer.setAttribute(contentSlotElement, 'slotIndex', slotIndex.toString());
        this.renderer.setAttribute(contentSlotElement, 'parsetoken', token);
        for (const node of contentSlot) {
          this.renderer.appendChild(contentSlotElement, node);
        }
        this.renderer.appendChild(placeholderElement, contentSlotElement);
      }
      slotIndex++;
    }
  }

  /**
   * Find all components that would be the ContentChildren of a dynamic component from a HTML node downwards and returns them in a hierarchical tree object
   * Important: This function depends on the component selector attributes 'parsetoken' and 'hookid' not being removed yet
   *
   * @param node - The HTML node to parse
   * @param treeLevel - The current tree level of DynamicContentChildren (for recursiveness)
   * @param dynamicComponentIndex - An index of all potential components that can be found
   */
  findContentChildren(node: Node, treeLevel: Array<DynamicContentChildren> = [], hookIndex: HookIndex): void {
    if (node['childNodes'] !== undefined && node.childNodes.length > 0) {
      node.childNodes.forEach((childNode, key) => {
        let componentFound = false;
        // If element has a parsetoken and hookid, it is a dynamic component
        if (childNode['attributes'] !== undefined && childNode['hasAttribute']('parsetoken') && childNode['hasAttribute']('hookid')) {
          const hookId = parseInt(childNode['getAttribute']('hookid'), 10);
          if (hookIndex.hasOwnProperty(hookId)) {
            treeLevel.push({
              name: hookIndex[hookId].componentRef.instance.constructor.name,
              componentRef: hookIndex[hookId].componentRef,
              contentChildren: []
            });
            componentFound = true;
          }
        }

        const treeLevelForChildren = componentFound ? treeLevel[treeLevel.length - 1].contentChildren : treeLevel;
        this.findContentChildren(childNode, treeLevelForChildren, hookIndex);
      });
    }
  }

  // Component creation
  // ----------------------------------------------------------------------------------------------------------------

  /**
   * Takes a hook along with a DOM node and loads the specified component class (normal or lazy-loaded).
   * Returns a subject the emits the component class when ready.
   *
   * @param componentConfig - The componentConfig from HookData
   * @param hook - The hook in question
   * @param placeholderElement - The placeholder DOM node to create the dynamic component in
   * @param options - The current HookComponentOptions
   */
  loadComponentClass(componentConfig: ComponentConfig, context: {[key: string]: any}, placeholderElement: Element, options: OutletOptions): ReplaySubject<new(...args: any[]) => any> {
    const componentClassLoaded: ReplaySubject<new(...args: any[]) => any> = new ReplaySubject(1);

    // a) If is normal class
    if (componentConfig.hasOwnProperty('prototype')) {
      componentClassLoaded.next(componentConfig as (new(...args: any[]) => any));

    // b) If is LazyLoadingComponentConfig
    } else if (componentConfig.hasOwnProperty('importPromise') && componentConfig.hasOwnProperty('importName')) {
      // Catch typical importPromise error
      if ((componentConfig as LazyLoadComponentConfig).importPromise instanceof Promise) {
        throw Error(`DynCompHooks: When lazy-loading a component, the "importPromise"-field must contain a function returning the import-promise, but it contained the promise itself.`);
      }
      // Warning if using old Angular version
      if (document && document.querySelector('[ng-version]')) {
        const version = parseInt(document.querySelector('[ng-version]').getAttribute('ng-version'), 10);
        if (version < 9 && isDevMode()) {
          console.warn('DynCompHooks: It seems you are trying to use lazy-loaded-components with an Angular version older than 9. Please note that this functionality requires the new Ivy renderer to be enabled.');
        }
      }

      (componentConfig as LazyLoadComponentConfig).importPromise().then((m) =>  {
        const importName = (componentConfig as LazyLoadComponentConfig).importName;
        const compClass = m.hasOwnProperty(importName) ? m[importName] : m['default'];
        componentClassLoaded.next(compClass);
      });

    } else {
      throw Error('DynCompHooks: The "component" property of a returned HookData object must either contain the component class or a LazyLoadComponentConfig');
    }

    return componentClassLoaded;
  }

  /**
   * Replaces a placeholder element with the correct component selector element once the component has been loaded
   *
   * @param compClass - The component class
   * @param placeholderElement - The placeholder element to be replaced
   */
  replacePlaceholderElement(compClass: new(...args: any[]) => any, placeholderElement: Element): Element {
    const selector = this.cfr.resolveComponentFactory(compClass).selector;
    const componentElement = this.renderer.createElement(selector);

    this.renderer.setAttribute(componentElement, 'hookid', placeholderElement.getAttribute('hookid'));
    this.renderer.setAttribute(componentElement, 'parsetoken', placeholderElement.getAttribute('parsetoken'));
    this.renderer.setAttribute(componentElement, 'parser', placeholderElement.getAttribute('parser'));

    const childNodes = Array.prototype.slice.call(placeholderElement.childNodes);
    for (const node of childNodes) {
      this.renderer.appendChild(componentElement, node);
    }

    this.renderer.insertBefore(placeholderElement.parentNode, componentElement, placeholderElement);
    this.renderer.removeChild(placeholderElement.parentNode, placeholderElement);

    return componentElement;
  }

  /**
   * Dynamically creates a component in the specified hostElement
   *
   * @param hook - The hook for this component
   * @param context - The current context
   * @param componentHostElement - The hostElement for the component
   * @param options - The current HookComponentOptions
   * @param compClass - The component's class
   */
  createComponent(hook: Hook, context: any, componentHostElement: Element, options: OutletOptions, compClass: new(...args: any[]) => any, token: string): void {

    // Resolve ng-content from content slots
    const projectableNodes = [];
    const contentSlotElements = Array.prototype.slice.call(componentHostElement.childNodes)
      .filter(entry => entry.tagName === 'DYNAMIC-COMPONENT-PLACEHOLDER-CONTENTSLOT' && entry.getAttribute('parsetoken') === token);

    for (const contentSlotElement of contentSlotElements) {
      const slotIndex = contentSlotElement.getAttribute('slotIndex');
      projectableNodes[slotIndex] = Array.prototype.slice.call(contentSlotElement.childNodes);
    }

    // Dynamically create component
    // Note: Transcluded content (including components) for ng-content can simply be added here in the form of the projectableNodes-argument.
    // The order of component creation or injection via projectableNodes does not seem to matter.
    const dynamicComponentFactory = this.cfr.resolveComponentFactory(compClass);
    const injector = hook.data.injector ? hook.data.injector : this.injector;
    const dynamicComponentRef = dynamicComponentFactory.create(injector, projectableNodes, componentHostElement);

    // Activate change detection
    this.appRef.attachView(dynamicComponentRef.hostView);

    // Track component
    hook.componentRef = dynamicComponentRef;

    // Update bindings
    hook.bindings = hook.parser.updateBindings(hook.id, hook.value, context);
    this.componentUpdater.updateComponentWithNewOutputs(hook, context, options);
    this.componentUpdater.updateComponentWithNewInputs(hook, options);

    // Call initial OnDynamicChanges with context (if not undefined)
    if (typeof hook.componentRef.instance['onDynamicChanges'] === 'function' && context !== undefined) {
      hook.componentRef.instance['onDynamicChanges']({context});
    }
  }

 
}