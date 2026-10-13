import { useConvex, useMutation as useConvexMutation, useQuery } from 'convex/react';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { convexToJson } from 'convex/values';
import { useCallback, useEffect, useState } from 'react';

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
 * Use plain `useQuery` for probes whose arguments change as someone types;
 * each value would otherwise stay subscribed.
 */
export function useLiveQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>
): FunctionReturnType<Query> | undefined {
  const client = useConvex();
  const key = JSON.stringify([getFunctionName(query), convexToJson(args)]);
  /* This effect must stay above `useQuery`: its cleanup takes the hold before the subscription below lets go, so the query is never dropped and re-added. */
  useEffect(() => {
    keepWarm(client, query, args, PAGE_HOLD_MS);
    return () => keepWarm(client, query, args, PAGE_HOLD_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` already covers the query and its arguments, which arrive as new objects each render.
  }, [key]);
  return useQuery(query, args);
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
        return result;
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        setError(normalized);
        throw normalized;
      } finally {
        setIsPending(false);
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
