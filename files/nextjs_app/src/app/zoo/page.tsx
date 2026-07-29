'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as PIXI from 'pixi.js';

const ANIMAL_EMOJI: Record<string, string> = {
  ゴリラ: '🦍', オウム: '🦜', サル: '🐒',
  ライオン: '🦁', ゾウ: '🐘', キリン: '🦒',
  シロクマ: '🐻‍❄️', ペンギン: '🐧', アザラシ: '🦭',
  カバ: '🦛', ワニ: '🐊', フラミンゴ: '🦩',
};

export default function ZooGamePage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const [loading, setLoading] = useState(true);

  const gameButtons = [
    { id: 'zukan', label: '📖 図鑑' },
    { id: 'training', label: '💪 育成中' },
    { id: 'map', label: '🗺️ エリアマップ' },
  ];

  useEffect(() => {
    if (typeof window === 'undefined' || !canvasRef.current) return;

    let isCancelled = false;
    const app = new PIXI.Application();

    const initGame = async () => {
      try {
        const res = await fetch('/api/zoo');
        if (!res.ok) throw new Error('動物園データの取得に失敗しました');
        const data = await res.json();
        const placements = data.placements || [];

        if (isCancelled) return;

        const FIELD_W = 1280;
        const FIELD_H = 450;

        await app.init({
          width: FIELD_W,
          height: FIELD_H,
          backgroundColor: 0x105b3e, // 💡 ベースカラーを芝生と同じ緑に
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          hello: false,
        });

        if (isCancelled) {
          app.destroy(true, { children: true });
          return;
        }

        appRef.current = app;
        if (canvasRef.current) {
          canvasRef.current.innerHTML = '';
          canvasRef.current.appendChild(app.canvas);
        }

        const worldLayer = new PIXI.Container();
        app.stage.addChild(worldLayer);

        // 🌿 【修正】黒い外枠（stroke）や分割を完全に無くし、「緑一色」だけを塗るクリーンな設計に
        const bgField = new PIXI.Graphics()
          .rect(0, 0, FIELD_W, FIELD_H)
          .fill({ color: 0x105b3e });
        worldLayer.addChild(bgField);

        // 動物の描画ロジック
        placements.forEach((p: any) => {
          const animalName = p.userAnimal?.animal?.name || '未知の動物';
          const emoji = ANIMAL_EMOJI[animalName] ?? '🐾';
          
          const animalLevel = p.userAnimal?.level || 1;
          const sizeMap = [28, 38, 50];
          const fontSize = sizeMap[Math.min(animalLevel - 1, 2)] || 38;

          const emojiStyle = new PIXI.TextStyle({ fontSize, fontFamily: 'sans-serif' });
          const emojiText = new PIXI.Text({ text: emoji, style: emojiStyle });
          
          emojiText.x = p.pos_x - (fontSize / 2);
          emojiText.y = p.pos_y - (fontSize / 2);
          
          emojiText.interactive = true;
          emojiText.cursor = 'grab';

          let dragging = false;
          let dragOffsetX = 0;
          let dragOffsetY = 0;

          emojiText.on('pointerdown', (e) => {
            dragging = true;
            dragOffsetX = e.global.x - emojiText.x;
            dragOffsetY = e.global.y - emojiText.y;
          });

          emojiText.on('pointermove', (e) => {
            if (!dragging) return;
            emojiText.x = e.global.x - dragOffsetX;
            emojiText.y = e.global.y - dragOffsetY;
          });

          emojiText.on('pointerup', async () => {
            if (!dragging) return;
            dragging = false;
            
            const newX = emojiText.x;
            const newY = emojiText.y;
            try {
              await fetch(`/api/zoo/${p.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pos_x: newX, pos_y: newY }),
              });
            } catch (err) {
              console.error('位置の更新に失敗しました:', err);
            }
          });

          const nameStyle = new PIXI.TextStyle({ fill: 0xffffff, fontSize: 11, fontFamily: 'sans-serif' });
          const nameText = new PIXI.Text({ text: animalName, style: nameStyle });
          nameText.x = emojiText.x - 4;
          nameText.y = emojiText.y + fontSize + 4;

          worldLayer.addChild(emojiText);
          worldLayer.addChild(nameText);
        });

        setLoading(false);
      } catch (error) {
        console.error('ゲーム画面の読み込みエラー:', error);
        setLoading(false);
      }
    };

    initGame();

    return () => {
      isCancelled = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
      }
    };
  }, []);

  return (
    <div className="w-screen h-screen bg-[#105b3e] flex flex-col items-center justify-between p-8 relative overflow-hidden select-none">
      
      {/* 空のグラデーション */}
      <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-sky-400 to-blue-500 z-0" />
      
      {/* 💡 【修正】左右の終わりを深く下げ、中央の高さは変えずに丸みをより強くした凸カーブ */}
      {/* widthを240%に広げ、左右を-70%外に逃がし、縦幅を240pxにすることで、ダイナミックで大きな弧を描きます */}
      <div 
        className="absolute bg-[#105b3e] z-10"
        style={{
          width: '240%',
          height: '240px',
          top: '56px',
          left: '-70%',
          borderRadius: '50% 50% 0 0',
        }}
      />

      {/* タスク一覧に戻るボタン */}
      <button
        onClick={() => router.push('/tasks')}
        className="absolute top-4 left-6 bg-slate-900/85 hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-xl shadow-lg transition-all border border-slate-700 z-50 flex items-center gap-2"
      >
        ← タスク管理に戻る
      </button>

      {/* タイトルエリア */}
      <div className="text-center text-white mt-2 w-full z-20">
        <h1 className="text-4xl font-black tracking-wider drop-shadow-lg flex items-center justify-center gap-2">
          🌳 MY ZOO GAME
        </h1>
      </div>

      {/* 🎮 中央スペースの枠線クラス（border-8 や bg-slate-950）を除去し、緑フィールドが完全に溶け込むように変更 */}
      <div className="flex-1 flex items-center justify-center w-full max-w-7xl z-20 mt-10">
        <div 
          ref={canvasRef}
          className="overflow-x-auto max-w-full"
        />
      </div>

      {/* 右下の操作ボタン群 */}
      <div className="absolute bottom-8 right-6 flex flex-col md:flex-row gap-3 z-50">
        {gameButtons.map((btn) => (
          <button
            key={btn.id}
            className="bg-slate-900/90 hover:bg-slate-900 active:scale-95 text-slate-100 font-bold px-5 py-3 rounded-xl shadow-xl transition-all border border-slate-700 flex items-center justify-center gap-2 tracking-wide min-w-[120px]"
          >
            {btn.label}
          </button>
        ))}
      </div>
      
    </div>
  );
}