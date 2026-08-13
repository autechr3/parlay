export const TEST_EMAIL = "mag@saf.com";
export const TEST_PASSWORD = "localdev123";

// Fresh, curriculum-less user for e2e/onboarding.spec.ts — must never accumulate a curriculum or
// an onboarded_at stamp across runs, so global-setup.ts resets its state every time (see that
// file's header comment for why reset-in-place was chosen over delete-in-teardown).
export const ONBOARD_TEST_EMAIL = "onboard-test@saf.com";
export const ONBOARD_TEST_PASSWORD = "localdev123";
