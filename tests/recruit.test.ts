import type { ButtonInteraction, VoiceBasedChannel } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { buildRecruitEmbed, buildSeekEmbed, handleRecruitButton, inviteLink } from '../src/discord/commands.js';
import { ERR, MSG } from '../src/messages.js';

describe('buildRecruitEmbed', () => {
  it('카테고리·채널·멤버·설명을 보여준다', () => {
    const embed = buildRecruitEmbed({
      hostId: 'host',
      category: '일반',
      channelId: '24',
      memberCount: 3,
      userLimit: 4,
      description: '큰맵 즐교 300+',
    }).toJSON();
    expect(embed.title).toBe(MSG.recruitTitle);
    expect(embed.description).toBe(MSG.recruitBody('host'));
    expect(embed.fields).toEqual([
      { name: MSG.fieldCategory, value: '일반' },
      { name: MSG.fieldChannel, value: '<#24>', inline: true },
      { name: MSG.fieldMembers, value: '3명 / 4명', inline: true },
      { name: MSG.fieldDescription, value: '큰맵 즐교 300+' },
    ]);
  });

  it('인원 제한이 없으면 현재 인원만, 설명이 없으면 설명 칸이 없다', () => {
    const embed = buildRecruitEmbed({ hostId: 'h', category: '경쟁', channelId: 'c', memberCount: 2, userLimit: 0 }).toJSON();
    expect(embed.fields?.find((f) => f.name === MSG.fieldMembers)?.value).toBe('2명');
    expect(embed.fields?.some((f) => f.name === MSG.fieldDescription)).toBe(false);
  });
});

describe('buildSeekEmbed', () => {
  it('구직자와 카테고리, PR 설명을 보여준다', () => {
    const embed = buildSeekEmbed({ seekerId: 'seeker', category: '경쟁', description: '다이아 원딜' }).toJSON();
    expect(embed.title).toBe(MSG.seekTitle);
    expect(embed.description).toBe(MSG.seekBody('seeker'));
    expect(embed.fields).toEqual([
      { name: MSG.fieldCategory, value: '경쟁' },
      { name: MSG.fieldDescription, value: '다이아 원딜' },
    ]);
  });
});

function fakeChannel(createInvite: () => Promise<{ url: string }>) {
  return {
    id: 'vc',
    name: '일반 #24',
    url: 'https://discord.com/channels/g/vc',
    createInvite: vi.fn(createInvite),
  };
}

describe('inviteLink', () => {
  it('초대링크를 만든다', async () => {
    const channel = fakeChannel(async () => ({ url: 'https://discord.gg/abc' }));
    expect(await inviteLink(channel as unknown as VoiceBasedChannel)).toBe('https://discord.gg/abc');
  });

  it('초대 권한이 없으면 채널 링크로 대신한다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const channel = fakeChannel(async () => {
      throw new Error('Missing Permissions');
    });
    expect(await inviteLink(channel as unknown as VoiceBasedChannel)).toBe(channel.url);
  });
});

function fakeButton(opts: { clickerId: string; inVoice: boolean; dmFails?: boolean }) {
  const channel = fakeChannel(async () => ({ url: 'https://discord.gg/abc' }));
  const send = vi.fn(async () => {
    if (opts.dmFails) throw new Error('Cannot send messages to this user');
  });
  const interaction = {
    customId: 'recruit:seeker',
    user: { id: opts.clickerId },
    member: { voice: { channel: opts.inVoice ? channel : null } },
    guild: { name: '서버' },
    client: { users: { send } },
    deferred: false,
    replied: false,
    reply: vi.fn(async () => undefined),
    deferReply: vi.fn(async () => undefined),
    editReply: vi.fn(async () => undefined),
  };
  return { interaction, send, run: () => handleRecruitButton(interaction as unknown as ButtonInteraction<'cached'>) };
}

describe('handleRecruitButton', () => {
  it('음성채널에 있는 사람이 누르면 구직자 DM으로 초대링크를 보낸다', async () => {
    const { interaction, send, run } = fakeButton({ clickerId: 'host', inVoice: true });
    await run();
    expect(send).toHaveBeenCalledWith(
      'seeker',
      expect.objectContaining({ content: MSG.inviteDm('host', '일반 #24', '서버') }),
    );
    const components = (send.mock.calls[0] as unknown[])[1] as { components: { toJSON(): unknown }[] };
    expect(JSON.stringify(components.components[0]!.toJSON())).toContain('https://discord.gg/abc');
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: MSG.inviteSent('seeker') }));
  });

  it('음성채널 밖에서 누르면 안내만 한다', async () => {
    const { interaction, send, run } = fakeButton({ clickerId: 'host', inVoice: false });
    await run();
    expect(send).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: ERR.recruitNotInVoice }));
  });

  it('구직자 본인이 누르면 안내만 한다', async () => {
    const { interaction, send, run } = fakeButton({ clickerId: 'seeker', inVoice: true });
    await run();
    expect(send).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: ERR.recruitSelf }));
  });

  it('DM이 막혀 있으면 누른 사람에게 알린다', async () => {
    const { interaction, run } = fakeButton({ clickerId: 'host2', inVoice: true, dmFails: true });
    await run();
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: ERR.dmClosed }));
  });

  it('같은 사람이 5분 안에 다시 누르면 DM을 또 보내지 않는다', async () => {
    await fakeButton({ clickerId: 'host3', inVoice: true }).run();
    const again = fakeButton({ clickerId: 'host3', inVoice: true });
    await again.run();
    expect(again.send).not.toHaveBeenCalled();
    expect(again.interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: ERR.inviteCooldown }));
  });
});
