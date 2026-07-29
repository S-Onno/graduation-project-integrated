import { redirect } from 'next/navigation';

export default function RootPage() {
  // 💡 トップページ（/）にアクセスされたら、デフォルトでタスク管理（/tasks）へ自動転送します
  redirect('/tasks');
}