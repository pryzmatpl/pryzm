const path = require('path');

// Simulate the logic from toolsService.ts
const isAbsolutePath = (p) => {
    if (p.startsWith('/')) return true;
    if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
    return false;
};

const resolvePathAgainstWorkspace = (pathStr, workspaceRoot) => {
    if (isAbsolutePath(pathStr) || pathStr.includes('://')) {
        return pathStr;
    }
    const separator = workspaceRoot.includes('\\') ? '\\' : '/';
    const resolvedPath = `${workspaceRoot}${separator}${pathStr.replace(/^[./\\]+/, '')}`;
    return resolvedPath;
};

const workspaceRoot = '/run/media/piotro/CACHE/void';
const testPaths = [
    'PKGBUILD',
    './PKGBUILD',
    '../outside.txt',
    '/absolute/path/file.txt',
    'src/main.ts'
];

console.log(`Workspace Root: ${workspaceRoot}`);
console.log('-----------------------------------');

testPaths.forEach(p => {
    const resolved = resolvePathAgainstWorkspace(p, workspaceRoot);
    console.log(`Input: ${p.padEnd(20)} -> Resolved: ${resolved}`);
});

