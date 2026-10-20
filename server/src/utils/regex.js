// Escapes user input for use inside a RegExp, so characters like . * ( [
// match literally instead of acting as patterns.
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
