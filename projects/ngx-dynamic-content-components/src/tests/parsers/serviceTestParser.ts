import { HookParser, HookPosition, HookValue, HookData, HookBindings } from '../../lib/interfacesPublic';
import { GenericSelectorFinder } from '../../lib/parsers/genericSelector/services/genericSelectorFinder';
import { NgContentTestComponent } from '../components/ngContentTest/ngContentTest.c';
import { ComponentFactoryResolver, Injectable } from '@angular/core';
import { SingleTagTestComponent } from '../components/singleTag/singleTagTest.c';

/**
 * This parser serves to test configuring parsers that are services
 */
@Injectable()
export class ServiceTestParser implements HookParser {
  name: string = 'ServiceTestParser';
  component = SingleTagTestComponent;

  constructor(private genericSelectorFinder: GenericSelectorFinder, private cfr: ComponentFactoryResolver) {
  }

  public findHooks(text: string, context: {[key: string]: any}): Array<HookPosition> {
    const selector = 'dynhooks-serviceparsercomponent';
    return this.genericSelectorFinder.findSingleTagSelectors(text, selector);
  }

  public loadHook(hookId: number, hookValue: HookValue, context: {[key: string]: any}, childNodes: Array<Element>): HookData {
    return {
      component: this.component,
      injector: undefined
    };
  }

  public updateBindings(hookId: number, hookValue: HookValue, context: {[key: string]: any}): HookBindings {
    return {};
  }
}