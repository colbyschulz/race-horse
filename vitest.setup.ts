import "@testing-library/jest-dom/vitest";

// Unit tests mock every DB call, but a few API-route suites import modules
// that instantiate the Neon client at load time and throw without a URL.
// A placeholder keeps those suites loadable on a machine with no .env.
process.env.DATABASE_URL ??= "postgres://vitest:vitest@localhost:5432/vitest";
