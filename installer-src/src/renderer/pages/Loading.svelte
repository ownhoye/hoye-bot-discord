<div class="loader">
    <svg class="spinner" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
        <circle class="track" cx="25" cy="25" r="20" fill="none" stroke-width="4"/>
        <circle class="arc" cx="25" cy="25" r="20" fill="none" stroke-width="4"
            stroke-linecap="round" stroke-dasharray="90 220"/>
    </svg>
</div>

<style>
    .loader {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1e1f22;
    }

    .spinner {
        width: 56px;
        height: 56px;
        animation: rotate 1s linear infinite;
    }

    .track {
        stroke: rgba(255, 255, 255, 0.08);
    }

    .arc {
        stroke: #5865F2;
        transform-origin: center;
        animation: rotate 0.9s ease-in-out infinite;
    }

    @keyframes rotate {
        100% { transform: rotate(360deg); }
    }
</style>
