<script lang="ts">
  import { toast } from '../lib/toast.svelte';
</script>

<div class="toast-region" role="status" aria-live="polite">
  {#if toast.message}
    <div class="toast">{toast.message}</div>
  {/if}
</div>

<style>
  .toast-region {
    position: fixed;
    left: 50%;
    bottom: calc(1.25rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 100;
    pointer-events: none;
  }
  .toast {
    padding: 0.6rem 1.1rem;
    border-radius: 999px;
    background: var(--grad);
    color: #fff;
    font-weight: 600;
    font-size: 0.9rem;
    white-space: nowrap;
    box-shadow: var(--shadow);
    animation: pop 0.18s ease-out;
  }
  @keyframes pop {
    from {
      transform: translateY(8px) scale(0.96);
      opacity: 0;
    }
  }
</style>
