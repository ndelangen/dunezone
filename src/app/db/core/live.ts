import { useMutation as useConvexMutation } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { useCallback, useState } from 'react';

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
  const data = liveData ?? initialData?.();
  return {
    data,
    isPending: liveData === undefined,
    isLoading: liveData === undefined,
  };
}

export function useLiveMutation<TVariables, TResult>(
  mutationRef: FunctionReference<'mutation'>
): LiveMutationResult<TVariables, TResult> {
  const mutateRef = useConvexMutation(mutationRef);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<TResult | undefined>(undefined);

  const mutateAsync = useCallback(
    async (variables: TVariables): Promise<TResult> => {
      setIsPending(true);
      setError(null);
      try {
        const result = (await mutateRef(variables as never)) as TResult;
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
    [mutateRef]
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
