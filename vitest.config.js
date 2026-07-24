import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // bin/ runs as a real subprocess in the CLI tests, so v8 never sees it —
      // counting it would report a fake hole. src/ is where the logic lives.
      include: ['src/**'],
      // The text report also lands in a file so CI can paste it into the job summary.
      reporter: [['text', { file: 'coverage.txt' }], 'text-summary', 'json-summary'],
    },
  },
})
