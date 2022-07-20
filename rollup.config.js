import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'build/main.js',
  output: {
    dir: 'build_cjs',
    format: 'cjs',
  },
  plugins: [
    nodeResolve({
      modulesOnly: true,
      exportConditions: ["node"]
      // resolveOnly: (mod) => mod != "chalk"
    }),
  ],
  
};