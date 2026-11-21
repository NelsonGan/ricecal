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
  forgetCurrentPlace,
  type ResolvedPlace,
  resolveCurrentPlace,
} from './currentPlace'
export {
  type CurrentCoordinateError,
  CurrentLocationError,
  describeCoordinate,
  getCurrentCoordinate,
  getLocationPermission,
  type LocationPermission,
  type LocationPermissionState,
  openLocationSettings,
  placeFromGeocodedAddress,
  requestLocationPermission,
} from './deviceLocation'
export {
  appleLanguage,
  nearbyPlaces,
  PlaceSearchError,
  type PlaceSearchErrorCode,
  reverseGeocodePlace,
  searchPlaces,
} from './placeSearch'
export {
  answerLocationsOffer,
  autoTagEnabled,
  locationsEnabled,
  recordMealForLocationsOffer,
  resetPlacesStorageForTest,
  setAutoTag,
  setLocationsEnabled,
  useLocationsOfferDue,
  useLocationsPreference,
} from './preference'
export { type Coordinate, type PlaceResult, toEntryLocation } from './types'
