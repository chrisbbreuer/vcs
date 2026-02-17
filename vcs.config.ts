export default {
  verbose: false,
  author: {
    name: '',
    email: '',
  },
  ci: {
    checks: [
      { name: 'typecheck', command: 'bun --bun tsc --noEmit' },
      { name: 'test', command: 'bun test' },
      { name: 'lint', command: 'pickier run . --mode lint' },
    ],
  },
}
