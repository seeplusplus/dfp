/* eslint-disable @angular-eslint/no-conflicting-lifecycle */
import {
  Directive,
  DoCheck,
  EventEmitter,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  Optional,
  Output,
  PLATFORM_ID,
  SimpleChanges,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';

import { Subject, timer } from 'rxjs';
import { filter, switchMap, takeUntil } from 'rxjs/operators';

import { DELAY_TIME } from './consts';
import { DfpService } from './dfp.service';
import { DfpAd } from './types';
import { SlotRenderEndedEvent } from './events';

@Directive({
  selector: '[dfpAd]',
  exportAs: 'dfpAd'
})
export class DfpAdDirective implements DoCheck, OnChanges, OnDestroy {
  private $destroy = new Subject<void>();
  private $update = new Subject<void>();
  private element?: HTMLElement;
  private slot?: googletag.Slot;

  @Output() adRendered: EventEmitter<void> = new EventEmitter();

  @Input() set dfpAd(dfpAd: string | DfpAd) {
    if (typeof dfpAd === 'string') {
      this.unitPath = dfpAd;
    } else {
      Object.assign(this, dfpAd);
    }
  }
  unitPath!: string;
  @Input('dfpAdId') id?: string;
  @Input('dfpAdSize') size?: googletag.GeneralSize;
  @Input('dfpAdSizeMapping') sizeMapping?: googletag.SizeMappingArray;
  @Input('dfpAdCategoryExclusion') categoryExclusion?: string | string[];
  /**
   * This works only for non-SRA requests.
   */
  @Input('dfpAdClickUrl') clickUrl?: string;
  @Input('dfpAdCollapseEmptyDiv') collapseEmptyDiv?:
    | boolean
    | [boolean, boolean];
  @Input('dfpAdForceSafeFrame') forceSafeFrame?: boolean;
  @Input('dfpAdSafeFrameConfig') safeFrameConfig?: googletag.SafeFrameConfig;
  @Input('dfpAdTargeting') targeting?: Record<string, string | string[]>;
  @Input('dfpAdAdsense') adsense?: Record<string, string>;

  constructor(
    private viewContainer: ViewContainerRef,
    private templateRef: TemplateRef<unknown>,
    private dfp: DfpService,
    @Optional() private router: Router,
    @Inject(PLATFORM_ID) platformId: Object,
  ) {
    if (isPlatformBrowser(platformId)) {
      this.init();
    }
  }

  private init(): void {
    this.$update
      .pipe(
        switchMap(() => timer(DELAY_TIME)),
        takeUntil(this.$destroy),
      )
      .subscribe(() => {
        this.dfp.cmd(() => this.display());
      });

    this.dfp.events
      .pipe(filter((event) => 'isEmpty' in event))
      .subscribe((event) => {
        if (
          !(event as SlotRenderEndedEvent).isEmpty &&
          this.slot?.getSlotId() &&
          this.slot?.getSlotId() === event.slot.getSlotId()
        ) {
          this.adRendered.emit();
        }
      });

    this.router &&
      this.router.events
        .pipe(
          filter((event) => event instanceof NavigationEnd),
          takeUntil(this.$destroy),
        )
        .subscribe(() => {
          this.$update.next();
        });
  }

  create(): void {
    if (this.unitPath) {
      if (!this.element) {
        const view = this.viewContainer.createEmbeddedView(this.templateRef);
        this.element = view.rootNodes[0];
      }
      this.$update.next();
    } else {
      this.clear();
    }
  }

  display(): void {
    if (!this.element || this.element.innerText.match(/\S+/)) {
      return;
    }

    let parentElement = this.element.parentElement;
    while (parentElement) {
      if (parentElement.getAttribute('ng-version')) {
        break;
      }
      if (
        parentElement.style.visibility === 'hidden' ||
        parentElement.style.display === 'none'
      ) {
        return;
      }
      parentElement = parentElement.parentElement;
    }

    if (this.slot && this.id === this.element.id) {
      this.dfp.define(this, this.slot);
      this.dfp.refresh(this.slot);
    } else {
      this.destroy();
      const id = this.element.id || this.id;
      this.slot = this.dfp.define(Object.assign({}, this, { id: id }));
      this.element.id = id || this.slot.getSlotElementId();
      this.id = this.element.id;
      this.dfp.display(this.slot);
    }
  }

  clear(): void {
    this.viewContainer.clear();
    this.element = undefined;
    this.destroy();
  }

  destroy(): void {
    if (this.slot) {
      this.dfp.destroy(this.slot);
      this.slot = undefined;
    }
  }

  ngDoCheck(): void {
    if (this.element && this.element.id && this.id !== this.element.id) {
      this.id = this.element.id;
      this.destroy();
      this.create();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['dfpAd'] || changes['id'] || changes['size'];
    if (change && !change.isFirstChange()) {
      this.clear();
    }
    this.create();
  }

  ngOnDestroy(): void {
    this.$destroy.next();
    this.clear();
  }
}
