// Where the React Query cache is saved on the device. Kept in its own module so
// the sign-in page can clear it without pulling React Query into its bundle.
export const QUERY_CACHE_STORAGE_KEY = "rh-query-cache";
