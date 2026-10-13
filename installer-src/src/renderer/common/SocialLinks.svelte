<script>
    import {tooltip} from "./tooltip";
    
    const githubUrl = "https://github.com/ownhoye/hoye-bot-discord";
</script>

<div class="social-links">
    <!-- GitHub -->
    <a use:tooltip={{text: "GitHub"}} aria-label="GitHub" class="social" id="gitea" target="_blank" href={githubUrl}>
        <svg tabindex="-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
            <path d="M5.583 7.229c-2.464-0.005-5.755 1.557-5.573 5.479 0.281 6.125 6.557 6.693 9.068 6.745 0.271 1.146 3.224 5.109 5.411 5.318h9.573c5.74-0.38 10.036-17.365 6.854-17.427-5.271 0.25-8.396 0.375-11.073 0.396v5.297l-0.839-0.365-0.005-4.932c-3.073 0-5.781-0.141-10.917-0.396-0.646-0.005-1.542-0.115-2.5-0.115zM5.927 9.396h0.297c0.349 3.141 0.917 4.974 2.068 7.781-2.938-0.349-5.432-1.198-5.891-4.38-0.24-1.646 0.563-3.365 3.526-3.401z"/>
        </svg>
    </a>


</div>

<style>
    .social-links {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        margin-top: -5px;
        margin-right: -5px;
    }

    .social {
        width: 28px;
        height: 28px;
        margin-top: 5px;
        margin-right: 5px;
        background-color: var(--bg3-alt);
        border-radius: 50%;
        color: var(--text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: 150ms ease;
        outline: none;
    }

    .social:hover {
        color: var(--text-normal);
    }

    .social:active {
        background-color: var(--bg4);
    }

    .social svg {
        width: 14px;
        height: auto;
        fill: currentColor;
    }
</style>
