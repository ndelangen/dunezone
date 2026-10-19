import { useConvex, useMutation as useConvexMutation, useQueries, useQuery } from 'convex/react';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { convexToJson, jsonToConvex } from 'convex/values';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { keepWarm, PAGE_HOLD_MS } from './warm';

type MutationOptions<TResult, TVariables> = {
  onSuccess?: (data: TResult, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
  onSettled?: (data: TResult | undefined, error: Error | null, variables: TVariables) => void;
};

export type LiveQueryResult<TData> = {
  data: TData | undefined;
  isPending: boolean;
  isLoading: boolean;
};

export type LiveMutationResult<TVariables, TResult> = {
  mutate: (variables: TVariables, options?: MutationOptions<TResult, TVariables>) => void;
  mutateAsync: (variables: TVariables) => Promise<TResult>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  data: TResult | undefined;
  reset: () => void;
};

/**
 * A Convex subscription's value in the shape the pages read.
 *
 * Waiting is the only state it reports, because it is the only one it can: a live query that fails throws to the route's catch boundary rather than returning, which is why `isError` and `error` were struck from the result type (#732).
 * `isPending` and `isLoading` are the same answer under two names, kept because callers read both.
 *
 * There is no `enabled` argument and there was never a caller for one: every one of the twenty-two call sites passed the literal `true`, so the flag only ever ANDed with a constant.
 * A subscription that should not run is not disabled here, it is not mounted, which is the contract Pickers already follow.
 */
export function toLiveQueryResult<TData>(
  liveData: TData | undefined,
  initialData?: () => TData | undefined
): LiveQueryResult<TData> {
  /* Strictly undefined, never `??`: a query that answers null has settled, and collapsing that null
     would report "settled with no data", which is the state every session gate reads as signed-in.
     Only the not-yet-answered subscription may fall back to the loader's seed. */
  const data = liveData === undefined ? initialData?.() : liveData;
  return {
    data,
    isPending: liveData === undefined,
    isLoading: liveData === undefined,
  };
}

/**
 * A page query's live subscription that stays warm for a while after the page lets go of it, so going back to the page, or a loader for it, answers from the browser instead of the server.
 * Use plain `useQuery`, or `hold: false`, for arguments that change as someone types;
 * each value would otherwise stay subscribed.
 */
export function useLiveQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>,
  options?: { hold?: boolean }
): FunctionReturnType<Query> | undefined {
  useWarmHold(query, args, options?.hold ?? true);
  return useQuery(query, args);
}

/**
 * A page query, held warm like `useLiveQuery`, whose answer stays in place through a failed re-run.
 *
 * A failure before the first answer still throws to the route's catch boundary.
 * Once the page has an answer for these arguments, a re-run that fails (a function timeout on a busy deployment) keeps that answer until the next re-run, so what the page mounted on it, such as a live game table and its socket, is not torn down by one failed execution.
 * The server's next answer, success or refusal, replaces it.
 */
export function useHeldLiveQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>
): FunctionReturnType<Query> | undefined {
  const { key, subscription } = useWarmHold(query, args);
  const [held, setHeld] = useState<{ key: string; data: FunctionReturnType<Query> } | null>(null);
  /* Convex tracks the request object's identity in its subscription state. A fresh map schedules
     another render before commit, even when the answer is still pending. */
  const queries = useMemo(() => ({ held: subscription }), [subscription]);
  const result = useQueries(queries).held as FunctionReturnType<Query> | Error | undefined;
  if (result instanceof Error) {
    if (held?.key === key) {
      return held.data;
    }
    throw result;
  }
  if (result !== undefined && (held?.key !== key || held.data !== result)) {
    setHeld({ key, data: result });
  }
  return result;
}

/** Holds a page query warm after its page lets go of it, and returns its stable subscription and key. */
function useWarmHold<Query extends FunctionReference<'query'>>(query: Query, args: FunctionArgs<Query>, hold = true) {
  const client = useConvex();
  const name = getFunctionName(query);
  const serializedArgs = JSON.stringify(convexToJson(args));
  const subscription = useMemo(
    () => ({
      query: makeFunctionReference<'query'>(name),
      args: jsonToConvex(JSON.parse(serializedArgs)) as FunctionArgs<Query>,
    }),
    [name, serializedArgs]
  );
  const key = JSON.stringify([name, convexToJson(args)]);
  /* Take the hold before the subscription lets go, so the query never drops between pages. */
  useEffect(() => {
    if (!hold) {
      return;
    }
    keepWarm(client, subscription.query, subscription.args, PAGE_HOLD_MS);
    return () => keepWarm(client, subscription.query, subscription.args, PAGE_HOLD_MS);
  }, [client, subscription, hold]);
  return { key, subscription };
}

export function useLiveMutation<TVariables, TResult>(
  mutationRef: FunctionReference<'mutation'>
): LiveMutationResult<TVariables, TResult> {
  const mutateRef = useConvexMutation(mutationRef);
  const operation = useCallback(
    async (variables: TVariables) => (await mutateRef(variables as never)) as TResult,
    [mutateRef]
  );
  return useLiveOperation(operation);
}

/** Keeps one pending and result state across a doorway operation that may prepare data before its mutation. */
export function useLiveOperation<TVariables, TResult>(
  operation: (variables: TVariables) => Promise<TResult>
): LiveMutationResult<TVariables, TResult> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<TResult | undefined>(undefined);

  const mutateAsync = useCallback(
    async (variables: TVariables): Promise<TResult> => {
      setIsPending(true);
      setError(null);
      try {
        const result = await operation(variables);
        setData(result);
        setIsPending(false);
        return result;
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        setError(normalized);
        setIsPending(false);
        throw normalized;
      }
    },
    [operation]
  );

  const mutate = useCallback(
    (variables: TVariables, options?: MutationOptions<TResult, TVariables>) => {
      void mutateAsync(variables)
        .then((result) => {
          options?.onSuccess?.(result, variables);
          options?.onSettled?.(result, null, variables);
        })
        .catch((err: Error) => {
          options?.onError?.(err, variables);
          options?.onSettled?.(undefined, err, variables);
        });
    },
    [mutateAsync]
  );

  const reset = useCallback(() => {
    setIsPending(false);
    setError(null);
    setData(undefined);
  }, []);

  return {
    mutate,
    mutateAsync,
    isPending,
    isError: error != null,
    error,
    data,
    reset,
  };
}

/** Adapts one live mutation at the data doorway while preserving its loading, error, callback, and reset behavior. */
export function useMappedLiveMutation<TVariables, TRawVariables, TRawResult, TResult>(
  mutationRef: FunctionReference<'mutation'>,
  toRawVariables: (variables: TVariables) => TRawVariables,
  fromRawResult: (result: TRawResult) => TResult
): LiveMutationResult<TVariables, TResult> {
  const raw = useLiveMutation<TRawVariables, TRawResult>(mutationRef);
  const { mutate: rawMutate, mutateAsync: rawMutateAsync } = raw;
  const mutateAsync = useCallback(
    async (variables: TVariables) => fromRawResult(await rawMutateAsync(toRawVariables(variables))),
    [fromRawResult, rawMutateAsync, toRawVariables]
  );
  const mutate = useCallback(
    (variables: TVariables, options?: MutationOptions<TResult, TVariables>) => {
      rawMutate(toRawVariables(variables), {
        onSuccess: (result) => options?.onSuccess?.(fromRawResult(result), variables),
        onError: (error) => options?.onError?.(error, variables),
        onSettled: (result, error) =>
          options?.onSettled?.(result === undefined ? undefined : fromRawResult(result), error, variables),
      });
    },
    [fromRawResult, rawMutate, toRawVariables]
  );

  return {
    ...raw,
    data: raw.data === undefined ? undefined : fromRawResult(raw.data),
    mutate,
    mutateAsync,
  };
}
