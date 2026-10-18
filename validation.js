const domains = ["Campus life", "Sustainability", "Learning", "Wellbeing", "Technology"];
const ideaFields = {
    title: { min: 3, max: 120, label: "Title" },
    problemStatement: { min: 20, max: 2000, label: "Problem statement" },
    technologies: { min: 1, max: 200, label: "Technologies" },
    expectedImpact: { min: 1, max: 2000, label: "Expected impact" }
};
const requiredIdeaFields = [...Object.keys(ideaFields), "domain"];

function validateRegistration(input = {}) {
    const errors = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) return { errors: { body: "Request body must be a JSON object" }, data: {} };
    for (const key of Object.keys(input)) {
        if (!["name", "email", "password"].includes(key)) errors.body = "Request contains unsupported account fields";
    }
    const name = typeof input.name === "string" ? input.name.trim() : "";
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";

    if (name.length < 2 || name.length > 80) errors.name = "Name must be between 2 and 80 characters";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address";
    if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) errors.password = "Password must be at least 8 characters and no more than 72 bytes";

    return { errors, data: { name, email, password } };
}

function validateIdea(input, { partial = false } = {}) {
    const errors = {};
    const data = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { data, errors: { body: "Request body must be a JSON object" } };
    }

    const allowedFields = new Set([...Object.keys(ideaFields), "domain"]);
    for (const key of Object.keys(input)) {
        if (!allowedFields.has(key)) errors.body = "Request contains unsupported or protected idea fields";
    }

    for (const [field, rules] of Object.entries(ideaFields)) {
        if (partial && !(field in input)) continue;
        const value = typeof input[field] === "string" ? input[field].trim() : "";
        if (value.length < rules.min || value.length > rules.max) {
            errors[field] = `${rules.label} must be between ${rules.min} and ${rules.max} characters`;
        } else {
            data[field] = value;
        }
    }

    if (!partial || "domain" in input) {
        if (!domains.includes(input.domain)) errors.domain = "Choose a valid domain";
        else data.domain = input.domain;
    }

    if (partial && Object.keys(input).length === 0) errors.body = "Provide at least one field to update";
    return { data, errors };
}

module.exports = { domains, validateIdea, validateRegistration };