// このファイルは scripts/sprites.mjs(npm run sprites)が自動で作ります。手で書き換えないでください。
// public/sprites/animals/ にある、動物ごと・成長段階ごとのスプライトの動作の一覧

import type { Stage } from '@/lib/zooAreas'

export const SPRITE_MANIFEST: Record<string, Partial<Record<Stage, readonly string[]>>> = {
  'crocodile': { BABY: ['swim', 'walk'], CHILD: ['swim', 'walk'], ADULT: ['swim', 'walk'] },
  'elephant': { BABY: ['walk'], CHILD: ['walk'], ADULT: ['walk'] },
  'giraffe': { BABY: ['walk'] },
  'lion': { BABY: ['walk'], CHILD: ['walk'], ADULT: ['walk'] },
}
