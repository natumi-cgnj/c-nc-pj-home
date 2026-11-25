const fs = require('node:fs');
// These legacy tests inspect structural source and execute it without the
// language runtime. Ignore localization metadata, keeping every original
// element, ID, label, handler and business-data expression intact. The language
// tests separately exercise the actual metadata and translation runtime.
exports.readFileSync = function (file, encoding) {
  const value = fs.readFileSync(file, encoding);
  return typeof value === 'string' && /\.(?:html|js|mjs)$/.test(String(file))
    ? value.replace(/\sdata-ui(?:-[a-z-]+)?="[^"]*"/g, '') : value;
};
