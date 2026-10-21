const fs = require('node:fs');
const path = require('node:path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const FILE_NAME = 'Localizable.strings';
const CONTENT = '"DESKTOP_NEEDS_YOU" = "A desktop needs you";\n';

function writeStrings(platformProjectRoot, projectName) {
  const file = path.join(platformProjectRoot, projectName, FILE_NAME);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, CONTENT);
  return file;
}

function withStringsFile(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const { platformProjectRoot, projectName } = modConfig.modRequest;
      writeStrings(platformProjectRoot, projectName);
      return modConfig;
    },
  ]);
}

function withStringsResource(config) {
  return withXcodeProject(config, (modConfig) => {
    const { projectName } = modConfig.modRequest;
    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: path.join(projectName, FILE_NAME),
      groupName: projectName,
      project: modConfig.modResults,
      isBuildFile: true,
    });
    return modConfig;
  });
}

module.exports = (config) => withStringsResource(withStringsFile(config));
module.exports.writeStrings = writeStrings;
