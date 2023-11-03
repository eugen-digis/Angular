import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ConfigurationService,
  ModuleService,
  ModuleSettingsService,
  PatientService,
} from '@huma-engineering/core';
import {
  ModuleDetailViewTypeEnum,
  ModuleId,
  ModuleSettings,
} from '@huma-engineering/modules';
import { BaseModule, ModuleStatus } from '@huma-engineering/shared-models';
import {
  ModuleDetailLayoutComponent,
  ModuleDetailLayoutContentComponent,
  ModuleDetailLayoutSidebarComponent,
} from '@huma-engineering/ui/layout';
import { BaseComponent } from '@huma-engineering/utils';

import {
  PatientsDetailsCardComponent,
  PatientsDetailsModuleComponent,
  PersonalModulePipe,
} from '@huma-engineering/core/features';
import {
  AnalyticsEventSource,
  AnalyticsEventType,
  AnalyticsTrackerService,
} from '@huma-engineering/integrations/analytics';
import { HumaTranslationService } from '@huma-engineering/utils/i18n';
import { capitalize } from 'lodash';
import { takeUntil, withLatestFrom } from 'rxjs';

/**
 * Patients details.
 * Provide screen with detailed information about patients module.
 */
@Component({
  selector: 'huma-patients-details',
  templateUrl: './patients-details.component.html',
  styleUrls: ['./patients-details.component.less'],
  standalone: true,
  imports: [
    NgIf,
    ModuleDetailLayoutComponent,
    ModuleDetailLayoutSidebarComponent,
    NgFor,
    PatientsDetailsCardComponent,
    ModuleDetailLayoutContentComponent,
    PatientsDetailsModuleComponent,
    AsyncPipe,
    PersonalModulePipe,
  ],
})
export class PatientsDetailsComponent extends BaseComponent {
  readonly ModuleStatus = ModuleStatus;
  readonly ModuleId = ModuleId;
  private readonly _analytics = inject(AnalyticsTrackerService, {
    optional: true,
  });
  private readonly _translate = inject(HumaTranslationService);

  isOverlayMode = false;

  /**
   * Active module on the detailed view.
   */
  activeModuleSettings?: ModuleSettings;

  /**
   * Overlay module settings on the detailed view.
   */
  overlayModuleSettings?: ModuleSettings;

  /**
   * @param activeRoute - active app route
   * @param deployment - deployment service
   * @param modules - modules service
   * @param router - modules service
   * @param cdr - change detector ref
   * @param moduleSettingsSvc - module settings service
   * @param patient - patient service
   */
  constructor(
    private activeRoute: ActivatedRoute,
    public deployment: ConfigurationService,
    public modules: ModuleService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    public moduleSettingsSvc: ModuleSettingsService,
    public patient: PatientService,
  ) {
    super();

    this.activeRoute.params
      .pipe(
        withLatestFrom(this.moduleSettingsSvc.moduleSettings$),
        takeUntil(this._destroy$),
      )
      .subscribe(([params, modSettings]) => {
        const moduleId = params.moduleId as string;
        this.activeModuleSettings = modSettings?.find((moduleSettings) => {
          if (moduleId === ModuleId.QUESTIONNAIRE) {
            return (
              moduleSettings.moduleId === moduleId &&
              moduleSettings.questionnaireId === moduleId
            );
          }

          const modules = moduleSettings.modules;
          const multiModuleSettings = modules?.find((m) => m.id === moduleId);
          if (multiModuleSettings) {
            return true;
          }

          return moduleSettings.module?.id === moduleId;
        });
        this.cdr.markForCheck();
      });
  }

  /**
   * Module selected.
   *
   * @param module - base module
   * @param moduleSettings - module settings
   */
  onModuleSelect(module: BaseModule, moduleSettings?: ModuleSettings): void {
    if (moduleSettings && this.isOverlayMode) {
      this._handleOverlayMode(moduleSettings);
      return;
    }

    if (
      moduleSettings?.moduleId === ModuleId.QUESTIONNAIRE &&
      moduleSettings.questionnaireId === ModuleId.QUESTIONNAIRE
    ) {
      this._sendAnalyticsEvent(moduleSettings);
      void this.router.navigate([`../${moduleSettings.moduleId}`], {
        relativeTo: this.activeRoute,
      });

      return;
    }

    this._sendAnalyticsEvent(moduleSettings);
    void this.router.navigate([`../${module.id}`], {
      relativeTo: this.activeRoute,
    });
  }

  /**
   * Send analytics event.
   * This method will send analytics event for module viewed.
   *
   * @param moduleSettings - module settings to track
   * @param view - module view
   */
  private _sendAnalyticsEvent(
    moduleSettings?: ModuleSettings | null,
    view?: ModuleDetailViewTypeEnum,
  ): void {
    this._analytics?.track({
      event: AnalyticsEventType.MODULE_VIEWED,
      source: AnalyticsEventSource.PATIENT_DETAILED_VIEW,
      properties: {
        module_id: moduleSettings?.module?.moduleId || moduleSettings?.moduleId,
        patient_id: this.patient.latestPatient?.id,
        module_config_id: moduleSettings?.module?.id,
        module_name: moduleSettings
          ? this._translate.instant(moduleSettings?.getModuleName())
          : undefined,
        module_view_type: capitalize(
          `${
            view ||
            moduleSettings?.detailView?.defaultView ||
            ModuleDetailViewTypeEnum.CHART
          } View`,
        ),
      },
    });
  }

  /**
   * Module view changes.
   *
   * @param moduleSettings - module settings
   * @param view - selected module view
   */
  onViewChange(
    moduleSettings?: ModuleSettings,
    view?: ModuleDetailViewTypeEnum,
  ): void {
    this._sendAnalyticsEvent(moduleSettings, view);
  }

  /**
   * Tack module changes.
   *
   * @param index - modules index
   * @returns index
   */
  trackByModule(index: number): number {
    return index;
  }

  /**
   * Clears settings related to overlay mode.
   *
   * Is invoked whenever value if isOverlayMode changes.
   *
   * @param isOverlayMode - whether we're in overlay mode.
   */
  clearOverlay(isOverlayMode: boolean) {
    if (isOverlayMode) return;

    this.overlayModuleSettings = undefined;
  }

  /**
   * Handles case where overlay module is active.
   *
   * @param moduleSettings - module settings of selected module to overlay
   */
  private _handleOverlayMode(moduleSettings: ModuleSettings): void {
    if (moduleSettings === this.activeModuleSettings) {
      this.isOverlayMode = false;
      this.overlayModuleSettings = undefined;
      return;
    }

    if (moduleSettings === this.overlayModuleSettings) {
      this.overlayModuleSettings = undefined;
      return;
    }

    if (moduleSettings?.detailView?.isComparable) {
      this.overlayModuleSettings = moduleSettings;
    }
  }
}
