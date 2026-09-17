function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function paintFinder(modules: boolean[][], row: number, col: number) {
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      const edge = x === 0 || y === 0 || x === 6 || y === 6
      const core = x >= 2 && x <= 4 && y >= 2 && y <= 4
      modules[row + y][col + x] = edge || core
    }
  }
}

export function qrPreviewModules(payload: string, size = 21): boolean[][] {
  const modules = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  paintFinder(modules, 0, 0)
  paintFinder(modules, 0, size - 7)
  paintFinder(modules, size - 7, 0)

  for (let i = 8; i < size - 8; i += 1) {
    modules[6][i] = i % 2 === 0
    modules[i][6] = i % 2 === 0
  }

  let seed = fnv1a(payload || 'edumanage-id-card')
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inFinder =
        (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8) || x === 6 || y === 6
      if (inFinder) continue
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      modules[y][x] = seed % 3 !== 0
    }
  }
  return modules
}
