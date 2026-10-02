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
import type { SessionService } from '../services/session.js';

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
  const outcome = await service.assemble(interaction.guild, session);
  if (!outcome.ok) return followUpError(interaction, outcome.reason);

  await interaction.editReply({
    content: `${interaction.message.content}\n\n${formatAssemble(session, outcome)}`,
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
  const outcome = await service.assemble(interaction.guild, session);
  if (!outcome.ok) {
    await interaction.deleteReply().catch(() => undefined);
    return followUpError(interaction, outcome.reason);
  }
  await interaction.editReply({ content: formatAssemble(session, outcome), allowedMentions: NO_PINGS });
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

const mentions = (ids: readonly string[]) => ids.map((id) => `<@${id}>`).join(' ');

function formatDraft(session: Session, unassigned: string[]): string {
  const lines = [`🎲 **팀 편성 결과** · <#${session.lobbyId}>`, ''];
  session.teams.forEach((team, i) => lines.push(`**${i + 1}팀** (${team.length}명) ${mentions(team)}`));
  if (unassigned.length > 0) lines.push(`**미지정** (${unassigned.length}명) ${mentions(unassigned)}`);
  lines.push('', `<@${session.hostId}>님이 **split team**을 누르면 팀 채널로 옮겨요. 다시 섞으려면 명령을 다시 쳐 주세요.`);
  return lines.join('\n');
}

function formatSplit(session: Session, notMoved: string[]): string {
  const lines = [`🚌 **분배 완료** · <#${session.lobbyId}>`, ''];
  session.teams.forEach((team, i) => lines.push(`<#${session.teamChannelIds[i]}> ${mentions(team)}`));
  if (notMoved.length > 0) lines.push('', `로비에 없어서 옮기지 못한 사람: ${mentions(notMoved)}`);
  lines.push('', '게임이 끝나면 **assemble**을 눌러 로비로 모아요.');
  return lines.join('\n');
}

function formatAssemble(session: Session, outcome: { moved: number; failed: number; keptChannels: number }): string {
  const lines = [`✅ **모으기 완료** · <#${session.lobbyId}>로 ${outcome.moved}명을 옮기고 판을 끝냈어요.`];
  if (outcome.failed > 0) lines.push(`옮기지 못한 사람 ${outcome.failed}명이 있어요.`);
  if (outcome.keptChannels > 0) lines.push(`사람이 남아 있는 팀 채널 ${outcome.keptChannels}개는 지우지 않았어요.`);
  return lines.join('\n');
}
