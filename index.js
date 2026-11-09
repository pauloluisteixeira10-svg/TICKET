const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const configuracoes = new Map();
const ticketsAbertos = new Map();

const comandos = [
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Configurar o sistema de tickets')
    .addChannelOption(option =>
      option
        .setName('categoria')
        .setDescription('Categoria dos tickets')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('cargo')
        .setDescription('Cargo da equipe de atendimento')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Enviar o painel de atendimento')
].map(command => command.toJSON());

client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: comandos }
    );

    console.log('Comandos registrados!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === 'painel'
    ) {
      const categoria = interaction.options.getChannel('categoria');
      const cargo = interaction.options.getRole('cargo');

      configuracoes.set(interaction.guildId, {
        categoria: categoria.id,
        cargo: cargo.id
      });

      return interaction.reply({
        content: `Configuração salva!\nCategoria: ${categoria.name}\nEquipe: ${cargo.name}`,
        ephemeral: true
      });
    }

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === 'ticket'
    ) {
      if (!interaction.memberPermissions.has(
        PermissionFlagsBits.Administrator
      )) {
        return interaction.reply({
          content: 'Somente administradores podem usar esse comando.',
          ephemeral: true
        });
      }

      if (!configuracoes.has(interaction.guildId)) {
        return interaction.reply({
          content: 'Configure primeiro usando /painel.',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#AFAFAF')
        .setTitle('CENTRAL DE ATENDIMENTO')
        .setDescription('Precisa de ajuda? Escolha uma opção abaixo.')
        .addFields(
          {
            name: '💰 Reembolso',
            value: 'Solicite atendimento sobre reembolsos.'
          },
          {
            name: '🎫 Suporte',
            value: 'Fale com nossa equipe de suporte.'
          }
        )
        .setFooter({ text: 'Sistema de Atendimento' });

      const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_reembolso')
          .setLabel('Reembolso')
          .setEmoji('💰')
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId('ticket_suporte')
          .setLabel('Suporte')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({
        embeds: [embed],
        components: [botoes]
      });

      return interaction.reply({
        content: 'Painel enviado com sucesso!',
        ephemeral: true
      });
    }

    if (
      interaction.isButton() &&
      ['ticket_reembolso', 'ticket_suporte'].includes(interaction.customId)
    ) {
      const config = configuracoes.get(interaction.guildId);

      if (!config) {
        return interaction.reply({
          content: 'O sistema ainda não foi configurado.',
          ephemeral: true
        });
      }

      const chave = `${interaction.guildId}-${interaction.user.id}`;

      if (ticketsAbertos.has(chave)) {
        return interaction.reply({
          content: 'Você já possui um ticket aberto!',
          ephemeral: true
        });
      }

      const tipo = interaction.customId === 'ticket_reembolso'
        ? 'reembolso'
        : 'suporte';

      const canal = await interaction.guild.channels.create({
        name: `${tipo}-${interaction.user.username}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .slice(0, 90),

        type: ChannelType.GuildText,
        parent: config.categoria,

        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          },
          {
            id: config.cargo,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ReadMessageHistory
            ]
          }
        ]
      });

      ticketsAbertos.set(chave, canal.id);

      const embed = new EmbedBuilder()
        .setColor('#AFAFAF')
        .setTitle('ATENDIMENTO ABERTO')
        .setDescription(
          `Olá, ${interaction.user}!\n\n` +
          `Seu atendimento de **${tipo}** foi criado.\n` +
          'Aguarde nossa equipe responder.'
        );

      const fechar = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`fechar_ticket_${interaction.user.id}`)
          .setLabel('Fechar ticket')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger)
      );

      await canal.send({
        content: `<@${interaction.user.id}> <@&${config.cargo}>`,
        embeds: [embed],
        components: [fechar]
      });

      return interaction.reply({
        content: `Seu ticket foi criado: ${canal}`,
        ephemeral: true
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith('fechar_ticket_')
    ) {
      const dono = interaction.customId.replace('fechar_ticket_', '');
      const config = configuracoes.get(interaction.guildId);

      const membro = await interaction.guild.members.fetch(
        interaction.user.id
      );

      const equipe = config && membro.roles.cache.has(config.cargo);
      const administrador = membro.permissions.has(
        PermissionFlagsBits.Administrator
      );

      if (
        interaction.user.id !== dono &&
        !equipe &&
        !administrador
      ) {
        return interaction.reply({
          content: 'Você não tem permissão para fechar este ticket.',
          ephemeral: true
        });
      }

      ticketsAbertos.delete(`${interaction.guildId}-${dono}`);

      await interaction.reply({
        content: 'Ticket fechado! O canal será excluído em 5 segundos.'
      });

      setTimeout(() => {
        interaction.channel.delete().catch(console.error);
      }, 5000);
    }

  } catch (error) {
    console.error('Erro:', error);

    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({
        content: 'Ocorreu um erro ao executar essa ação.',
        ephemeral: true
      }).catch(() => {});
    }
  }
});

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Faltam configurar as variáveis secretas do bot.');
} else {
  client.login(TOKEN);
}
