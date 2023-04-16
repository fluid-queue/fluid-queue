import { twitchApi } from "./twitch-api.js";

(async () => {
  await twitchApi.setup();

  await twitchApi.apiClient.asIntent(["chat"], async (ctx) => {
    const user = await ctx.users.getUserByName("liquidnya");
    console.log(
      JSON.stringify({
        userId: user?.id,
        userName: user?.name,
        userDisplayName: user?.displayName,
      })
    );
  });
})();
