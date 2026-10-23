import "server-only";

export function testDataResetEnabled() {
  // The legacy RPCs were revoked for every application role. Deliberately
  // ignore ALLOW_TEST_DATA_RESET in every environment; QA uses rollback fixtures.
  return false;
}
