const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getFinalRowsFromResponse,
} = require("../frontend-response-parser.js");

test("reads catalogRows in catalog mode", () => {
  const response = {
    catalogRows: [{ courseName: "A" }],
    responseMeta: { rowCount: 1 },
  };

  assert.equal(getFinalRowsFromResponse(response, "catalog").length, 1);
});

test("reads programmes in audit mode", () => {
  const response = {
    programmes: [{ programName: "A" }],
    responseMeta: { rowCount: 1 },
  };

  assert.equal(getFinalRowsFromResponse(response, "audit").length, 1);
});

test("falls back to programs in audit mode", () => {
  const response = {
    programs: [{ programName: "A" }],
    responseMeta: { rowCount: 1 },
  };

  assert.equal(getFinalRowsFromResponse(response, "audit").length, 1);
});

test("does not treat programme candidates as final rows", () => {
  const response = {
    programmeCandidates: [{ title: "A" }],
    responseMeta: { rowCount: 0 },
  };

  assert.deepEqual(getFinalRowsFromResponse(response, "audit"), []);
  assert.deepEqual(getFinalRowsFromResponse(response, "catalog"), []);
});
