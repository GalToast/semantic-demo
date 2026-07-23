<!--
  SearchErrorState.svelte — presentational wrapper for the full search error block.

  Wraps the shared ErrorState component (variant="card") with search-specific
  prop derivation. Receives the raw searchError and pre-normalized friendlyError,
  then forwards the correct props to ErrorState so the DOM contract classes
  (.search-error-state, .search-error-kicker, .search-error-text, etc.) are
  preserved byte-for-byte.

  Purely prop-driven: no store subscriptions, no event publishing.
-->
<script lang="ts">
  import ErrorState from '@components/ErrorState.svelte';
  import type { FriendlyError } from '@lib/utils/error-messages';

  interface SearchError {
    type?: string;
    query?: string;
    message?: string;
  }

  interface Props {
    /** The raw search error from appState (null when no error). */
    searchError: SearchError | null;
    /** Pre-normalized friendly error (title / detail / technical). */
    friendlyError: FriendlyError | null;
    /** Retry handler (re-runs the last query). */
    onRetry: () => void;
    /** Clear/dismiss handler (clears the search). */
    onDismiss: () => void;
  }

  let { searchError, friendlyError, onRetry, onDismiss }: Props = $props();
</script>

<ErrorState
  kicker="Retry needed"
  title={friendlyError?.title ?? 'Something went wrong'}
  detail={friendlyError?.detail}
  technical={friendlyError?.technical}
  retryLabel="Retry"
  retryAriaLabel={`Retry search for ${searchError?.query}`}
  {onRetry}
  dismissLabel="Clear"
  dismissAriaLabel="Clear search and dismiss"
  {onDismiss}
  technicalTestId="search-error-detail"
/>
