const test = require("node:test");
const assert = require("node:assert/strict");
const { validateIdea, validateRegistration } = require("../validation");

test("registration trims names and normalizes email", () => {
    const result = validateRegistration({ name: " Ada ", email: " ADA@EXAMPLE.COM ", password: "SecurePass1" });
    assert.deepEqual(result.errors, {});
    assert.equal(result.data.name, "Ada");
    assert.equal(result.data.email, "ada@example.com");
});

test("registration rejects malformed email and short password", () => {
    const result = validateRegistration({ name: "A", email: "not-an-email", password: "short" });
    assert.ok(result.errors.name);
    assert.ok(result.errors.email);
    assert.ok(result.errors.password);
});

test("idea validation trims accepted values and rejects protected fields", () => {
    const result = validateIdea({
        title: "  Campus garden  ",
        problemStatement: "There is not enough green space on campus.",
        domain: "Campus life",
        technologies: "Web app",
        expectedImpact: "More shared outdoor space",
        owner: "attacker"
    });
    assert.equal(result.data.title, "Campus garden");
    assert.match(result.errors.body, /protected idea fields/);
});

test("partial idea updates reject empty payloads and invalid domains", () => {
    assert.ok(validateIdea({}, { partial: true }).errors.body);
    assert.ok(validateIdea({ domain: "Other" }, { partial: true }).errors.domain);
});

test("registration rejects malformed JSON shapes and unsupported privilege fields", () => {
    assert.ok(validateRegistration(null).errors.body);
    assert.ok(validateRegistration({ name: "Ada", email: "ada@example.com", password: "SecurePass1", role: "admin" }).errors.body);
});