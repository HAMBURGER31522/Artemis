import path from 'node:path';

const defaultToolsDir = process.platform === 'win32'
  ? 'E:\\tools\\Artemis-Desktop'
  : path.resolve('.artemis-tools');

export function toolsDir() {
  return process.env.ARTEMIS_TOOLS_DIR || defaultToolsDir;
}

export function cargoTargetDir() {
  return process.env.CARGO_TARGET_DIR || path.join(toolsDir(), 'cargo-target');
}

export function childEnvironment() {
  return {
    ...process.env,
    CARGO_TARGET_DIR: cargoTargetDir(),
  };
}
