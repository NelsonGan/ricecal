/**
 * Meal locations below the screens (README: Meal locations): the per-phone
 * switches, the phone's position and its name, and the places Worker. In
 * `lib` because the data layer applies the automatic tag after an insert, and
 * `src/data` does not import a feature. The screens are `features/places`.
 */
export {
  autoTagLocation,
  autoTagWanted,
  type CurrentPlaceFailure,
  currentCoordinate,
  resolveCurrentPlace,
} from './currentPlace'
export {
  describeCoordinate,
  getLocationPermission,
  type LocationPermissionState,
  openLocationSettings,
  requestLocationPermission,
} from './deviceLocation'
export { nearbyPlaces, PlaceSearchError, searchPlaces } from './placeSearch'
export {
  answerLocationsOffer,
  recordMealForLocationsOffer,
  setAutoTag,
  setLocationsEnabled,
  useLocationsOfferDue,
  useLocationsPreference,
} from './preference'
export { type Coordinate, type PlaceResult, toEntryLocation } from './types'
