export { BiddingTable } from './biddingTable';
import { biddingTableResponse } from './biddingTable';

export default {
  async fetch(request, env) {
    return (await biddingTableResponse(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Pick<GameEnv, 'BIDDING_TABLES' | 'APPLICATION_ORIGIN'>>;
