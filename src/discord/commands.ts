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
import { findProblems, formatUptime, type HealthInput } from '../domain/health.js';
import { ERR, MSG } from '../messages.js';
import type { Session } from '../store/db.js';
import type { AssembleOutcome, SessionService } from '../services/session.js';

const SPLIT_PREFIX = 'split:';
const ASSEMBLE_PREFIX = 'assemble:';

/** 슬래시 명령과 옵션 이름. scripts/register-commands.mjs 와 맞춘다. */
const COMMAND = { ping: 'ping', generate: '팀짜기', assemble: '모으기' } as const;
const OPTION = { team: '팀수', number: '인원수', exclude: '제외' } as const;
const BUTTON = { split: '팀 분배', assemble: '모으기' } as const;

/** 멘션은 이름으로만 보이고 알림은 가지 않게 한다. */
const NO_PINGS = { parse: [] } as const;

export async function handleInteraction(interaction: Interaction, service: SessionService): Promise<void> {
  if (!interaction.inCachedGuild()) {
    if (interaction.isRepliable()) await replyError(interaction, ERR.guildOnly);
    return;
  }

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === COMMAND.ping) return handlePing(interaction, service);
    if (interaction.commandName === COMMAND.generate) return handleGenerate(interaction, service);
    if (interaction.commandName === COMMAND.assemble) return handleAssembleCommand(interaction, service);
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith(SPLIT_PREFIX)) return handleSplit(interaction, service);
    if (interaction.customId.startsWith(ASSEMBLE_PREFIX)) return handleAssembleButton(interaction, service);
  }
}

async function handlePing(interaction: ChatInputCommandInteraction<'cached'>, service: SessionService) {
  const health: HealthInput = {
    gatewayMs: Math.round(interaction.client.ws.ping),
    latencyMs: Math.max(0, Date.now() - interaction.createdTimestamp),
    uptimeMs: interaction.client.uptime,
    dbOk: service.isStoreHealthy(),
  };
  const problems = findProblems(health);
  log('ping', '-', problems.length === 0 ? 'ok' : problems.join(','));
  await interaction.reply({ content: formatPing(health) });
}

async function handleGenerate(interaction: ChatInputCommandInteraction<'cached'>, service: SessionService) {
  const lobby = interaction.member.voice.channel;
  if (!lobby) return replyError(interaction, ERR.notInVoice);
  if (lobby.type !== ChannelType.GuildVoice) return replyError(interaction, ERR.notGuildVoice);

  const team = interaction.options.getInteger(OPTION.team) ?? undefined;
  const number = interaction.options.getInteger(OPTION.number) ?? undefined;
  const excludeIds = parseMentions(interaction.options.getString(OPTION.exclude) ?? '');

  const outcome = service.generate(lobby, interaction.user.id, { team, number }, excludeIds);
  log('generate', outcome.ok ? outcome.session.id : '-', `lobby=${lobby.id}`, outcome.ok ? 'ok' : outcome.reason);
  if (!outcome.ok) return replyError(interaction, outcome.reason);

  await interaction.reply({
    content: formatDraft(outcome.session, lobby.name, outcome.unassigned, outcome.excluded),
    components: [buttonRow(SPLIT_PREFIX + outcome.session.id, BUTTON.split, ButtonStyle.Primary)],
    allowedMentions: NO_PINGS,
  });
}

async function handleSplit(interaction: ButtonInteraction<'cached'>, service: SessionService) {
  await interaction.deferUpdate();
  const sessionId = interaction.customId.slice(SPLIT_PREFIX.length);
  const outcome = await service.split(interaction.guild, sessionId, interaction.user.id);
  log('split', sessionId, `message=${interaction.message.id}`, outcome.ok ? 'ok' : outcome.reason);
  if (!outcome.ok) {
    if (outcome.stale) await interaction.editReply({ components: [] });
    return followUpError(interaction, outcome.reason);
  }

  await interaction.editReply({
    content: formatSplit(outcome.session, outcome.lobbyName, outcome.notMoved),
    components: [buttonRow(ASSEMBLE_PREFIX + outcome.session.id, BUTTON.assemble, ButtonStyle.Success)],
    allowedMentions: NO_PINGS,
  });
}

async function handleAssembleButton(interaction: ButtonInteraction<'cached'>, service: SessionService) {
  const session = service.getActive(interaction.customId.slice(ASSEMBLE_PREFIX.length));
  if (!session) {
    // 끝난 판의 버튼은 누르는 순간 지운다.
    await interaction.update({ components: [] });
    return followUpError(interaction, ERR.ended);
  }
  if (!service.canAssemble(session, interaction.user.id)) {
    return replyError(interaction, ERR.notMember);
  }

  await interaction.deferUpdate();
  const outcome = await service.assemble(interaction.guild, session.id);
  log('assemble', session.id, outcome.ok ? `ok moved=${outcome.moved}` : outcome.reason);
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
  if (!session) return replyError(interaction, ERR.nothingToAssemble);
  if (!service.canAssemble(session, interaction.user.id)) {
    return replyError(interaction, ERR.notMember);
  }

  await interaction.deferReply();
  const outcome = await service.assemble(interaction.guild, session.id);
  log('assemble', session.id, outcome.ok ? `ok moved=${outcome.moved}` : outcome.reason);
  if (!outcome.ok) {
    await interaction.deleteReply().catch(() => undefined);
    return followUpError(interaction, outcome.reason);
  }
  await interaction.editReply({ content: formatAssemble(outcome), allowedMentions: NO_PINGS });
}

function log(action: string, sessionId: string, ...details: string[]) {
  console.log(`[${action} ${sessionId.slice(0, 8)}] ${details.join(' ')}`);
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

export function formatPing(health: HealthInput): string {
  const problems = findProblems(health);
  const lines = [problems.length === 0 ? MSG.pingOk : MSG.pingBad];
  for (const problem of problems) lines.push(`- ${MSG.pingProblem[problem]}`);
  lines.push(
    '',
    `${MSG.pingGateway(health.gatewayMs)} · ${MSG.pingLatency(health.latencyMs)}`,
    MSG.pingUptime(formatUptime(health.uptimeMs)),
    MSG.pingDb(health.dbOk),
  );
  return lines.join('\n');
}

export function formatDraft(session: Session, lobbyName: string, unassigned: string[], excluded: string[]): string {
  return fit((withMembers) => {
    const list = (ids: string[]) => (withMembers ? ` ${mentions(ids)}` : '');
    const lines = [MSG.draftTitle(lobbyName), ''];
    session.teams.forEach((team, i) => lines.push(`${MSG.team(i, team.length)}${list(team)}`));
    if (unassigned.length > 0) lines.push(`${MSG.unassigned(unassigned.length)}${list(unassigned)}`);
    if (excluded.length > 0) lines.push(`${MSG.excluded(excluded.length)}${list(excluded)}`);
    lines.push('', MSG.draftFooter(session.hostId));
    return lines.join('\n');
  });
}

export function formatSplit(session: Session, lobbyName: string, notMoved: string[]): string {
  return fit((withMembers) => {
    const list = (ids: string[]) => (withMembers ? ` ${mentions(ids)}` : ` ${ids.length}명`);
    const lines = [MSG.splitTitle(lobbyName), ''];
    // 팀 채널은 모으기 뒤 지워지므로 채널 멘션 대신 팀 이름으로 적는다.
    session.teams.forEach((team, i) =>
      lines.push(`${MSG.team(i, team.length)}${withMembers ? ` ${mentions(team)}` : ''}`),
    );
    if (notMoved.length > 0) lines.push('', `${MSG.notMoved}${list(notMoved)}`);
    lines.push('', MSG.splitFooter);
    return lines.join('\n');
  });
}

function formatAssemble(outcome: Extract<AssembleOutcome, { ok: true }>): string {
  const where = MSG.lobby(outcome.lobbyName, outcome.lobbyRecreated);
  if (outcome.keptChannels > 0) return MSG.assembledPartial(where, outcome.moved, outcome.keptChannels);
  const lines = [MSG.assembled(where, outcome.moved)];
  if (outcome.failed > 0) lines.push(MSG.assembleFailed(outcome.failed));
  return lines.join('\n');
}
