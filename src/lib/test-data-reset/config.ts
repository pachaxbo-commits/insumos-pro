import "server-only";

export function testDataResetEnabled() {
  return process.env.ALLOW_TEST_DATA_RESET === "true";
}
