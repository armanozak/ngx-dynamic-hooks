import { Component, ViewChild, ViewChildren, OnInit, AfterViewInit, OnDestroy, Input, HostBinding, ElementRef, OnChanges, ChangeDetectorRef, QueryList, Output, EventEmitter, Inject, ContentChild, ContentChildren, DoCheck } from '@angular/core';
import { DynamicContentChildren, OnDynamicChanges, OnDynamicMount, OnDynamicData } from '../../../lib/interfacesPublic';

@Component({
  selector: 'dynhooks-lazytest',
  templateUrl: './lazytest.c.html',
  styleUrls: ['./lazytest.c.scss']
})
export class LazyTestComponent implements OnDynamicMount, OnDynamicChanges, DoCheck, OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() name: string;
  mountContext: any;
  mountContentChildren: Array<DynamicContentChildren>;
  changesContext: any;
  changesContentChildren: Array<DynamicContentChildren>;

  constructor (private cd: ChangeDetectorRef) {
  }


  ngOnInit () {
    // console.log('textbox init');
  }

  ngOnChanges(changes) {
    // console.log('textbox changes');
  }

  ngDoCheck() {
    // console.log('textbox doCheck');
  }

  ngAfterViewInit() {
    // console.log('textbox afterviewinit');
  }

  ngOnDestroy() {
    // console.log('textbox destroy');
  }

  onDynamicMount(data: OnDynamicData) {
    this.mountContext = data.context;
    this.mountContentChildren = data.contentChildren;
  }

  onDynamicChanges(data: OnDynamicData) {
    if (data.hasOwnProperty('context')) {
      this.changesContext = data.context;
    }
    if (data.hasOwnProperty('contentChildren')) {
      this.changesContentChildren = data.contentChildren;
    }
  }

}