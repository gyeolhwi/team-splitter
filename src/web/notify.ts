const API = 'https://discord.com/api/v10';

/** 알림을 보낸다. 실패해도 호출한 쪽을 막지 않는다. */
export type Notify = (text: string) => void;

export const noNotify: Notify = () => undefined;

/** 봇 토큰으로 Discord REST를 직접 불러 한 사람에게 DM을 보낸다. 봇 프로세스와는 무관하다. */
export function discordDm(botToken: string, userId: string, fetchFn: typeof fetch = fetch): Notify {
  const headers = { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' };
  let channelId: string | undefined;

  async function send(text: string) {
    if (!channelId) {
      const res = await fetchFn(`${API}/users/@me/channels`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ recipient_id: userId }),
      });
      if (!res.ok) throw new Error(`DM 채널 열기 실패 ${res.status}`);
      channelId = ((await res.json()) as { id: string }).id;
    }
    const res = await fetchFn(`${API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: text.slice(0, 2000), allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) throw new Error(`DM 보내기 실패 ${res.status}`);
  }

  return (text) => {
    send(text).catch((error) => console.error('관리자 DM 실패', error));
  };
}
