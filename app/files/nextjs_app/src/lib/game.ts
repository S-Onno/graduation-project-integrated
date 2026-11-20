/* ============================================================
 * 育成のルール(サーバーで使う)
 *
 * - 成長: 1〜3タスク: 赤ちゃん / 4〜8タスク: 子供 / 9タスク: 大人
 * - 新しい赤ちゃん: 開園している中で、いちばん新しいエリアから来る。
 *   そのエリアで、まだ迎えたことがない種類からランダムに選ぶ(最初の3匹は種類が重ならない)
 * - 開園: エリアの全種類(3種)を大人まで育てると、次のエリアが開園する
 *
 * どの関数も、db にトランザクション(tx)を渡して使う
 * (タスク完了の API で、同じユーザーの処理を1つずつ順番に行うため)
 * ============================================================ */

import { AnimalStage } from '@/generated/prisma/client'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from './prisma'
import { AREA_ORDER } from './zooAreas'
import type { AreaType } from './zooAreas'

type Db = Prisma.TransactionClient | typeof prisma

export function calcStage(taskCount: number): AnimalStage {
  if (taskCount >= 9) return 'ADULT'
  if (taskCount >= 4) return 'CHILD'
  return 'BABY'
}

// 新しい赤ちゃんを迎える。迎えた動物を返す(迎えられなかったときは null)
export async function acquireNewAnimal(db: Db, userId: string) {
  const unlockedAreas = await db.userArea.findMany({
    where: { userId, is_unlocked: true },
  })
  if (unlockedAreas.length === 0) return null

  // 開園しているエリアのうち、開園する順番(AREA_ORDER)がいちばん後のエリアから動物が来る
  const unlockedTypes = new Set<string>(unlockedAreas.map((a) => a.area_type))
  const latestArea = [...AREA_ORDER].reverse().find((type) => unlockedTypes.has(type))
  if (!latestArea) return null
  const animals = await db.animal.findMany({ where: { area_type: latestArea } })
  if (animals.length === 0) return null

  // そのエリアで、まだ迎えたことがない種類
  const owned = await db.userAnimal.findMany({
    where: { userId, animal: { area_type: latestArea } },
    select: { animalId: true },
  })
  const ownedIds = new Set(owned.map((o) => o.animalId))
  const notYetOwned = animals.filter((a) => !ownedIds.has(a.id))

  // TODO: 全種類を迎えたあと(最後のエリアの3種がそろったあと)の選び方は未定。
  //       今は、そのエリアの全種類からランダムに選ぶ
  const candidates = notYetOwned.length > 0 ? notYetOwned : animals
  const animal = candidates[Math.floor(Math.random() * candidates.length)]

  return db.userAnimal.create({
    data: { userId, animalId: animal.id, stage: 'BABY', task_count: 1 },
    include: { animal: true },
  })
}

// エリアの全種類が大人になっていたら、次のエリアを開園する。
// 新しく開園したエリアを返す(開園しなかったとき・すでに開園していたときは null)
export async function checkAreaUnlock(db: Db, userId: string, areaType: AreaType): Promise<AreaType | null> {
  const species = await db.animal.findMany({ where: { area_type: areaType }, select: { id: true } })
  if (species.length === 0) return null

  // 大人まで育てた種類(同じ種類を何匹育てても1と数える)
  const adultSpecies = await db.userAnimal.findMany({
    where: { userId, stage: 'ADULT', animal: { area_type: areaType } },
    select: { animalId: true },
    distinct: ['animalId'],
  })
  if (adultSpecies.length < species.length) return null

  const currentIndex = AREA_ORDER.indexOf(areaType)
  if (currentIndex === -1 || currentIndex >= AREA_ORDER.length - 1) return null
  const nextArea = AREA_ORDER[currentIndex + 1]

  const existing = await db.userArea.findUnique({
    where: { userId_area_type: { userId, area_type: nextArea } },
  })
  if (existing?.is_unlocked) return null

  await db.userArea.upsert({
    where: { userId_area_type: { userId, area_type: nextArea } },
    update: { is_unlocked: true, unlocked_at: new Date() },
    create: { userId, area_type: nextArea, is_unlocked: true, unlocked_at: new Date() },
  })
  return nextArea
}
