import { Link } from 'react-router-dom';

const CONTACT_EMAIL = 'pokerhtgapp@gmail.com';

/**
 * /privacy : プライバシーポリシー。ログインしていなくても見られる。
 * Google のログイン（OAuth 同意画面）を本番公開するために、この URL を登録している。
 */
export default function PrivacyPage() {
  return (
    <div className="privacy">
      <div className="privacy__header">
        <Link to="/setup" className="btn-secondary">
          ← トップへ
        </Link>
        <h2>プライバシーポリシー</h2>
      </div>

      <p>
        Poker Hand Logger（以下「本アプリ」）は、利用者の情報を以下のとおり取り扱います。
      </p>

      <section>
        <h3>1. 取得する情報</h3>
        <ul>
          <li>
            Google でログインしたとき：Google アカウントのメールアドレス、名前、プロフィール画像の URL
          </li>
          <li>ログインして記録したハンドのデータ（店名、日付、ブラインド、アクション、メモなど）</li>
          <li>
            サーバーの運用のため、各サービスのログに一時的に残るアクセス日時・IP アドレス・ブラウザの種類など
          </li>
        </ul>
        <p>
          ログインせずに使う場合、記録したハンドはその画面の中だけで扱い、運営者には送信しません（ページを閉じると消えます）。
          広告や、利用状況を解析するためのツールは使っていません。
        </p>
      </section>

      <section>
        <h3>2. 利用目的</h3>
        <p>
          ログインと、ハンド履歴の保存・表示のためだけに使います。広告への利用や、第三者への販売はしません。
        </p>
      </section>

      <section>
        <h3>3. 保存先・委託先</h3>
        <p>本アプリは、次のサービスを使って運営しています。各サービスは本アプリのためにデータを保存・処理します。</p>
        <ul>
          <li>Supabase：ログイン（認証）とデータベース</li>
          <li>Google Cloud：API サーバー</li>
          <li>Vercel：Web ページの配信</li>
        </ul>
        <p>ログイン状態を保つため、ログイン用の情報を利用者のブラウザに保存します。</p>
      </section>

      <section>
        <h3>4. AI サービスとの連携</h3>
        <p>
          利用者が自分で Claude などの AI サービスに本アプリを接続し、許可したときに限り、その利用者のハンドを読み取り専用で AI サービスに渡します。
          渡したデータは、その AI サービスの規約とプライバシーポリシーに沿って扱われます。接続はいつでも解除できます。
        </p>
      </section>

      <section>
        <h3>5. 第三者への提供</h3>
        <p>
          上の 3・4 の場合と、法令に基づいて求められた場合を除き、利用者の情報を第三者に提供しません。
        </p>
      </section>

      <section>
        <h3>6. データの削除</h3>
        <p>
          記録したハンドは、本アプリの過去ハンド一覧からいつでも削除できます。
          アカウントと、それに結びついたデータをすべて削除したい場合は、下の問い合わせ先にご連絡ください。
        </p>
      </section>

      <section>
        <h3>7. 改定</h3>
        <p>このポリシーを変更するときは、このページで知らせます。</p>
      </section>

      <section>
        <h3>8. 問い合わせ先</h3>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </section>

      <p className="hint">制定日：2026年10月24日</p>
    </div>
  );
}
