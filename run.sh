#!/bin/bash

set -e

error_exit() {
    echo "Error: $1"
    exit 1
}

fetch_and_reset_repo() {
    local repo_dir="$1"
    local branch_name="$2"

    git -C "$repo_dir" fetch
    git -C "$repo_dir" reset --hard "origin/$branch_name"
}

clone_or_update_repo() {
    local repo_name="$1"
    local repo_url="$2"
    local branch_name="$3"

    if [ -d "$repo_name" ]; then
        echo "Repository $repo_name already exists. Updating..."
        fetch_and_reset_repo "$repo_name" "$branch_name"
    else
        echo "Cloning repository $repo_name..."
        git clone "$repo_url" "$repo_name"
        fetch_and_reset_repo "$repo_name" "$branch_name"
    fi
}

run_docker_compose() {
    local services=("$@")

    echo "Building and starting Docker containers for services: ${services[*]}"
    docker compose --env-file postiz.env up -d --build "${services[@]}"
}

main() {
    [ -f docker-compose.yaml ] || error_exit "docker-compose.yaml not found."
    [ -f postiz.env ] || error_exit "postiz.env not found."

    declare -A repo_map=(
        [postiz]="git@github.com:Algorana/postiz-app.git"
    )

    declare -A default_branches=(
        [postiz]="develop"
    )

    local services_to_update=()

    if [ "$#" -eq 0 ]; then
        for repo_name in "${!repo_map[@]}"; do
            branch_name="${default_branches[$repo_name]}"
            clone_or_update_repo "$repo_name" "${repo_map[$repo_name]}" "$branch_name"
            services_to_update+=("$repo_name")
        done
    else
        for arg in "$@"; do
            IFS=':' read -r repo_name branch_name <<< "$arg"

            if [ -n "${repo_map[$repo_name]}" ]; then
                if [ -z "$branch_name" ]; then
                    branch_name="${default_branches[$repo_name]}"
                fi

                clone_or_update_repo "$repo_name" "${repo_map[$repo_name]}" "$branch_name"
                services_to_update+=("$repo_name")
            else
                error_exit "Repository $repo_name was not found in the list."
            fi
        done
    fi

    run_docker_compose "${services_to_update[@]}"
}

main "$@"
