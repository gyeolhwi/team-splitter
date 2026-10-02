import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
  type RepliableInteraction,
} from 'discord.js';
import type { Session } from '../store/db.js';
import type { AssembleOutcome, SessionService } from '../services/session.js';

const SPLIT_PREFIX = 'split:';
const ASSEMBLE_PREFIX = 'assemble:';

/** 멘션은 이름으로만 보이고 알림은 가지 않게 한다. */
const NO_PINGS = { parse: [] } as const;

export async function handleInteraction(interaction: Interaction, service: SessionService): Promise<void> {
  if (!interaction.inCachedGuild()) {
    if (interaction.isRepliable()) await replyError(interaction, '서버 안에서만 쓸 수 있어요.');
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'team') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'generate') return handleGenerate(interaction, service);
    if (sub === 'assemble') return handleAssembleCommand(interaction, service);
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith(SPLIT_PREFIX)) return handleSplit(interaction, service);
    if (interaction.customId.startsWith(ASSEMBLE_PREFIX)) return handleAssembleButton(interaction, service);
  }
}

async function handleGenerate(interaction: ChatInputCommandInteraction<'cached'>, service: SessionService) {
  const lobby = interaction.member.voice.channel;
  if (!lobby) return replyError(interaction, '음성채널에 먼저 들어간 뒤 다시 해 주세요.');
  if (lobby.type !== ChannelType.GuildVoice) return replyError(interaction, '일반 음성채널에서만 쓸 수 있어요.');

  const team = interaction.options.getInteger('team') ?? undefined;
  const number = interaction.options.getInteger('number') ?? undefined;
  const excludeIds = parseMentions(interaction.options.getString('non-target') ?? '');

  const outcome = service.generate(lobby, interaction.user.id, { team, number }, excludeIds);
  if (!outcome.ok) return replyError(interaction, outcome.reason);

  await interaction.reply({
    content: formatDraft(outcome.session, outcome.unassigned),
    components: [buttonRow(SPLIT_PREFIX + outcome.session.id, 'split team', ButtonStyle.Primary)],
    allowedMentions: NO_PINGS,
  });
}

async function handleSplit(interaction: ButtonInteraction<'cached'>, service: SessionService) {
  await interaction.deferUpdate();
  const sessionId = interaction.customId.slice(SPLIT_PREFIX.length);
  const outcome = await service.split(interaction.guild, sessionId, interaction.user.id);
  if (!outcome.ok) return followUpError(interaction, outcome.reason);

  await interaction.editReply({
    content: formatSplit(outcome.session, outcome.notMoved),
    components: [buttonRow(ASSEMBLE_PREFIX + outcome.session.id, 'assemble', ButtonStyle.Success)],
    allowedMentions: NO_PINGS,
  });
}

async function handleAssembleButton(interaction: ButtonInteraction<'cached'>, service: SessionService) {
  const session = service.getActive(interaction.customId.slice(ASSEMBLE_PREFIX.length));
  if (!session) return replyError(interaction, '이미 끝난 판이에요.');
  if (!service.canAssemble(session, interaction.user.id)) {
    return replyError(interaction, '판을 연 사람이나 참가자만 모을 수 있어요.');
  }

  await interaction.deferUpdate();
  const outcome = await service.assemble(interaction.guild, session.id);
  if (!outcome.ok) return followUpError(interaction, outcome.reason);

  await interaction.editReply({
    content: fit((withHistory) =>
      withHistory ? `${interaction.message.content}\n\n${formatAssemble(outcome)}` : formatAssemble(outcome),
    ),
    components: [],
    allowedMentions: NO_PINGS,
  });
}

async function handleAssembleCommand(interaction: ChatInputCommandInteraction<'cached'>, service: SessionService) {
  const session = service.findForAssemble(
    interaction.guildId,
    interaction.user.id,
    interaction.member.voice.channelId,
  );
  if (!session) return replyError(interaction, '모을 판이 없어요.');
  if (!service.canAssemble(session, interaction.user.id)) {
    return replyError(interaction, '판을 연 사람이나 참가자만 모을 수 있어요.');
  }

  await interaction.deferReply();
  const outcome = await service.assemble(interaction.guild, session.id);
  if (!outcome.ok) {
    await interaction.deleteReply().catch(() => undefined);
    return followUpError(interaction, outcome.reason);
  }
  await interaction.editReply({ content: formatAssemble(outcome), allowedMentions: NO_PINGS });
}

export async function replyError(interaction: RepliableInteraction, message: string) {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  }
}

async function followUpError(interaction: RepliableInteraction, message: string) {
  await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
}

function buttonRow(customId: string, label: string, style: ButtonStyle) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style),
  );
}

export function parseMentions(text: string): Set<string> {
  return new Set([...text.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]!));
}

/** 디스코드 메시지 최대 길이 */
const MAX_CONTENT = 2000;

const mentions = (ids: readonly string[]) => ids.map((id) => `<@${id}>`).join(' ');

/** 인원이 많아 2000자를 넘으면 멘션 목록을 빼고 인원 수만 보여준다. */
function fit(build: (withMembers: boolean) => string): string {
  const full = build(true);
  return full.length <= MAX_CONTENT ? full : build(false);
}

function formatDraft(session: Session, unassigned: string[]): string {
  return fit((withMembers) => {
    const list = (ids: string[]) => (withMembers ? ` ${mentions(ids)}` : '');
    const lines = [`🎲 **팀 편성 결과** · <#${session.lobbyId}>`, ''];
    session.teams.forEach((team, i) => lines.push(`**${i + 1}팀** (${team.length}명)${list(team)}`));
    if (unassigned.length > 0) lines.push(`**미지정** (${unassigned.length}명)${list(unassigned)}`);
    lines.push('', `<@${session.hostId}>님이 **split team**을 누르면 팀 채널로 옮겨요. 다시 섞으려면 명령을 다시 쳐 주세요.`);
    return lines.join('\n');
  });
}

function formatSplit(session: Session, notMoved: string[]): string {
  return fit((withMembers) => {
    const list = (ids: string[]) => (withMembers ? ` ${mentions(ids)}` : ` ${ids.length}명`);
    const lines = [`🚌 **분배 완료** · <#${session.lobbyId}>`, ''];
    session.teams.forEach((team, i) => lines.push(`<#${session.teamChannelIds[i]}>${list(team)}`));
    if (notMoved.length > 0) lines.push('', `로비에 없어서 옮기지 못한 사람:${list(notMoved)}`);
    lines.push('', '게임이 끝나면 **assemble**을 눌러 로비로 모아요.');
    return lines.join('\n');
  });
}

function formatAssemble(outcome: Extract<AssembleOutcome, { ok: true }>): string {
  const where = outcome.lobbyRecreated
    ? `원래 로비가 없어서 새로 만든 <#${outcome.lobbyId}>`
    : `<#${outcome.lobbyId}>`;
  if (outcome.keptChannels === 0) {
    const lines = [`✅ **모으기 완료** · ${where}로 ${outcome.moved}명을 옮기고 판을 끝냈어요.`];
    if (outcome.failed > 0) lines.push(`옮기지 못한 사람 ${outcome.failed}명이 있어요.`);
    return lines.join('\n');
  }
  return [
    `⚠️ **일부만 모았어요** · ${where}로 ${outcome.moved}명을 옮겼어요.`,
    `사람이 남아 있는 팀 채널 ${outcome.keptChannels}개는 지우지 않았어요. 비면 자동으로 정리되고, \`/team assemble\`로 다시 모을 수도 있어요.`,
  ].join('\n');
}
