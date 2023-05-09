import {
  ApplicationCommand,
  ApplicationCommandType,
  Embed,
  EmbedBuilder,
  Interaction,
  ReactionCollector,
  TextChannel,
} from "discord.js";
import {
  CustomInteractionReplyOptions,
  interpretInteractionResponse,
} from "../classes/CustomInteraction";
import { formatDuration, intervalToDuration } from "date-fns";
import { staffAppCustomId, staffAppQuestions } from "lib/staffapp";

import { CustomClient } from "lib/client";
import { InteractionType } from "discord-api-types/v10";
import { TimestampModel } from "models/Timestamp";

export default async function (client: CustomClient, interaction: Interaction) {
  // if (interaction.guildId) {
  //   await client.loadGuildSettings(interaction.guildId);
  // }

  // if (interaction.isButton()) {
  //   const [buttonType, command] = interaction.customId.split(":");
  //   const existingButtonHandler = client.buttons.get(buttonType);
  //   if (existingButtonHandler) {
  //     await existingButtonHandler.execute(interaction);
  //   }
  // }

  const isModalSubmit = interaction.isModalSubmit();
  staffApp: if (isModalSubmit && interaction.customId == staffAppCustomId) {
    // At this point, impose a cooldown. Lets start with a week
    const TIMESPAN_COOLDOWN = 7 * (24 * 60 * 60 * 1000);
    const identifier = `${interaction.user.id}-staff-application`;
    const lastApplied = await TimestampModel.findOne({ identifier });
    if (
      lastApplied?.timestamp &&
      lastApplied.timestamp.valueOf() + TIMESPAN_COOLDOWN >= Date.now()
    ) {
      // Nah bro, deny that shit
      await interaction.reply({
        ephemeral: true,
        content:
          `Your last staff application was sent ${formatDuration(
            intervalToDuration({ start: lastApplied.timestamp, end: Date.now() })
          )} ago\n` +
          `You can send a new one in ${formatDuration(
            intervalToDuration({
              start: Date.now(),
              end: lastApplied.timestamp.valueOf() + TIMESPAN_COOLDOWN,
            })
          )}`,
      });
      return;
    } else {
      await TimestampModel.updateOne(
        { identifier },
        { timestamp: new Date() },
        { upsert: true }
      );
    }
    const qna = [];
    for (const question of staffAppQuestions) {
      let answer = interaction.fields.getTextInputValue(question.customId);
      if (answer === "") {
        answer = "**N/A**";
        if (question.required) {
          await interaction.reply("Submission failed.");
          break staffApp;
        }
      }
      qna.push({ name: question.label, value: answer });
    }
    await interaction.reply({
      content: "Application sent successfully.",
      ephemeral: true,
    });

    const authorId = interaction.user.id;
    const embed = new EmbedBuilder()
      .setColor(0xaa00aa)
      .setTitle(`Application of ${interaction.user.tag}`)
      .addFields(qna);

    const channel = await client.channels.fetch("995792003726065684");
    if (channel?.isTextBased()) {
      channel.send({
        content: `<@${authorId}> (${interaction.user.tag}) is applying for staff:`,
        embeds: [embed],
      });
    }
  }

  if (interaction.isCommand()) {
    const cmd = client.slashCommands.get(
      `${interaction.commandType}-${interaction.commandName}`
    );
    if (!cmd) return;
    let log = `User ${interaction.user.username} executed ${
      ApplicationCommandType[interaction.commandType]
    } command ${interaction.commandName}`;
    if (interaction.user) log += ` targeting ${interaction.user.username}`;
    else if (interaction.isMessageContextMenuCommand()) {
      log += ` targeting ${interaction.targetMessage.id}`;
    }

    client.log("CMD", log);

    const response = await cmd.execute(interaction).catch(
      (e: Error) =>
        ({
          content: `Error: ${e.message}`,
          ephemeral: true,
        } as CustomInteractionReplyOptions)
    );
    if (interaction.replied || interaction.deferred || response == null) return;
    const send = interpretInteractionResponse(response);
    if (Object.keys(send).length > 0) interaction.reply(send);
    else interaction.reply({ content: "Error: No response", ephemeral: true });
  } else if (interaction.isAutocomplete()) {
    const ret = client.autocompleteOptions.get(interaction.commandName);
    if (ret) {
      const focused = interaction.options.getFocused(true);
      const a = ret[focused.name](focused.value, interaction);
      interaction.respond(a);
    }
  }
}
