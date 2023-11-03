import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  BillingRegistryData,
  BillingRegistryMetadata,
  BillingTrackerPriority,
  PatientId,
} from '../models';

type AddToRegistryConfig = Pick<
  BillingRegistryMetadata,
  'isOnThisPatientsPage' | 'isViewingThisPatientsActions'
>;

/**
 * Billing tracker registry service.
 *
 * This class is responsible for managing the displayed tracker widget
 * for patients.
 */
@Injectable({
  providedIn: 'root',
})
export class BillingTrackerRegistryService {
  /**
   * The registry for all patient's for whom billing tracker widget is shown.
   *
   * The keys represent patient ids currently being tracked and values are metadata
   * about those patients.
   */
  private readonly _trackerRegistry = new Map<
    PatientId,
    BillingRegistryMetadata
  >();

  /**
   * Behavior subject containing billing registry data.
   *
   * It mirrors {@link _trackerRegistry}'s entries, except in form of an object,
   * thereby hiding the usual map API from the outside.
   */
  private readonly _trackerRegistry$ = new BehaviorSubject<BillingRegistryData>(
    Object.fromEntries(this._trackerRegistry),
  );

  /**
   * Last known deployment Id.
   *
   * There is a very niche use case for this:
   * If patient is on call, switches back to deployment list or
   * moves to another deployment and his call is disconnected
   * for any reason, he can try the call again. In that instance, we
   * won't have access to the deploymentId of the patient we're trying
   * to call again. This property stores the last known deployment id for that.
   */
  private _lastRecordedDeploymentId?: string;

  /**
   * Returns all keys stored in registry.
   *
   * @returns array containing all registry keys
   */
  private get registryKeys() {
    return Array.from(this._trackerRegistry.keys());
  }

  /**
   * Registry of all patient's for whom billing tracker widget should be shown.
   *
   * @returns stream containing registry of all patients trackers
   */
  get trackerRegistry$() {
    return this._trackerRegistry$.asObservable();
  }

  /**
   * Returns size of registry.
   *
   * @returns number of items inside registry
   */
  get registrySize() {
    return this._trackerRegistry.size;
  }

  /**
   * Add patient to billing tracker registry.
   *
   * @param patientId - patient id for whom billing tracker should be shown.
   * @param config - config object which indicates whether user was added to registry
   * from patients page, or while viewing/performing a billable action.
   */
  addToRegistry(
    patientId: string,
    config: AddToRegistryConfig = {
      isOnThisPatientsPage: true,
      isViewingThisPatientsActions: false,
    },
  ) {
    const { isOnThisPatientsPage, isViewingThisPatientsActions } = config;

    // Handle case where patient is already registered
    if (this._trackerRegistry.has(patientId)) {
      const trackerEntry = this._trackerRegistry.get(patientId);
      const newTrackEntry: BillingRegistryMetadata = {
        ...trackerEntry,
        priority: isOnThisPatientsPage
          ? BillingTrackerPriority.HIGH
          : BillingTrackerPriority.LOW,
        isOnThisPatientsPage,
        isViewingThisPatientsActions,
      };

      this._addItemToRegistry(patientId, newTrackEntry);
      return;
    }

    // If new patient comes into play, we are not on the other patient's page, so
    // we set `isOnThisPatientsPage` to false, and set their priority based on their
    // onCall status
    this.registryKeys.forEach((k) => {
      const entry = this._trackerRegistry.get(k);
      if (!entry) return;

      this._addItemToRegistry(
        k,
        {
          ...entry,
          isOnThisPatientsPage: false,
          priority:
            entry.isOnCall && !isOnThisPatientsPage
              ? BillingTrackerPriority.HIGH
              : BillingTrackerPriority.LOW,
          isViewingThisPatientsActions: false,
        },
        false,
      );
    });

    // Finally set the new patient in the registry
    this._addItemToRegistry(patientId, {
      priority: isOnThisPatientsPage
        ? BillingTrackerPriority.HIGH
        : BillingTrackerPriority.LOW,
      isOnThisPatientsPage,
      isViewingThisPatientsActions,
    });
  }

  /**
   * Sets onCall status for patients already in registry.
   *
   * @param patientId - id of the patient who we are calling
   * @param deploymentId - deployment id the patient belongs to
   */
  setPatientOnCall(patientId: string, deploymentId: string) {
    // If we ever need to have our calls start from outside of patient's detail page
    // his data won't exist on registry, so we register the patient here.
    if (!this._trackerRegistry.has(patientId)) {
      this._addItemToRegistry(patientId, {
        priority: BillingTrackerPriority.LOW,
        deploymentId: deploymentId || this._lastRecordedDeploymentId,
        isOnCall: true,
        isOnThisPatientsPage: false,
      });
      return;
    }

    const trackerEntry = this._trackerRegistry.get(
      patientId,
    ) as BillingRegistryMetadata;

    const newTrackerEntry: BillingRegistryMetadata = {
      ...trackerEntry,
      isOnCall: true,
      isFinishedCall: false,
      deploymentId,
    };

    this._addItemToRegistry(patientId, newTrackerEntry);
  }

  /**
   * Removes patient from registry if patient not currently on a call.
   *
   * This is triggered whenever we leave patient's detail page, or whenever
   * we stop performing a billable action related to a patient outside patient's
   * own detail page (patient list, etc.).
   *
   * If the patient is on call, the patient does not get removed, but
   * the `isOnThisPatientsPage` property will be set to false,
   * as we are no longer on that patient's page.
   */
  removePatientIfNotOnCall() {
    this.registryKeys.forEach((k) => {
      const entry = this._trackerRegistry.get(k);
      if (!entry) {
        return;
      }

      if (!entry.isOnCall) {
        this._removeItemFromRegistry(k);
        return;
      }

      // If you are on call though, you are no longer on that patients page
      entry.isOnThisPatientsPage = false;
    });
  }

  /**
   * Removes patient from registry if call ends and we are not on that patient's page
   * or performing a billable action.
   *
   * This method **must** be invoked whenever call **finishes**. As long as the call didn't
   * finish on the page of the patient we were calling, we remove that patient from the queue.
   */
  removePatientIfNotOnPatientPageOrAction() {
    this.registryKeys.forEach((k) => {
      const trackerEntry = this._trackerRegistry.get(k);
      if (!trackerEntry) return;

      const isPerformingPatientRelatedActivity =
        trackerEntry.isOnThisPatientsPage ||
        trackerEntry.isViewingThisPatientsActions;

      if (trackerEntry.isFinishedCall && !isPerformingPatientRelatedActivity) {
        this._removeItemFromRegistry(k);
      }
    });
  }

  /**
   * Reflects the ending of patient's call in the registry.
   */
  finishPatientCall() {
    this.registryKeys.forEach((k) => {
      const entry = this._trackerRegistry.get(k);
      if (!entry || !entry.isOnCall) return;

      this._lastRecordedDeploymentId = entry.deploymentId;

      this._addItemToRegistry(k, {
        ...entry,
        isOnCall: false,
        isFinishedCall: true,
      });
    });
  }

  /**
   * Clears all entries in tracker registry.
   */
  clearTrackerRegistry() {
    this._trackerRegistry.clear();
    this._propagateRegistryChanges();
  }

  /**
   * Adds item to tracker registry and propagates changes to listeners.
   *
   * @param key - map key
   * @param item - map item
   * @param skipPropagation - whether state propagation should be skipped
   */
  private _addItemToRegistry(
    key: string,
    item: BillingRegistryMetadata,
    skipPropagation = false,
  ) {
    this._trackerRegistry.set(key, item);

    if (!skipPropagation) this._propagateRegistryChanges();
  }

  /**
   * Propagates changes to registry to all listeners.
   *
   * @param key - key to delete
   * @param skipPropagation - whether state propagation should be skipped
   */
  private _removeItemFromRegistry(key: string, skipPropagation = false) {
    this._trackerRegistry.delete(key);
    if (!skipPropagation) this._propagateRegistryChanges();
  }

  /**
   * Propagates changes to registry to all listeners.
   */
  private _propagateRegistryChanges() {
    this._trackerRegistry$.next(Object.fromEntries(this._trackerRegistry));
  }
}
