# MMO Shopping Backend - Docker & development helpers
SHELL := /bin/sh
COMPOSE ?= docker compose
COMPOSE_DEV ?= docker compose -f docker-compose.dev.yml

.DEFAULT_GOAL := help

.PHONY: help up down restart logs ps build rebuild sh migrate seed-admin db-shell dev dev-down dev-logs test lint clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Start the production-like stack (app + postgres)
	$(COMPOSE) up -d --build

down: ## Stop the stack
	$(COMPOSE) down

restart: ## Restart the app container
	$(COMPOSE) restart app

logs: ## Tail app logs
	$(COMPOSE) logs -f app

ps: ## Show container status
	$(COMPOSE) ps

build: ## Build the production image
	docker build -t mmo-shopping-be:local .

rebuild: ## Rebuild and recreate the stack
	$(COMPOSE) up -d --build --force-recreate

sh: ## Open a shell inside the app container
	$(COMPOSE) exec app sh

migrate: ## Run pending migrations inside the app container
	$(COMPOSE) exec app node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js

seed-admin: ## Seed the admin account (requires SEED_ADMIN_* env)
	$(COMPOSE) exec app node scripts/seed-admin.js

db-shell: ## Open psql inside the db container
	$(COMPOSE) exec db sh -c 'psql -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"'

dev: ## Start the development stack (hot reload)
	$(COMPOSE_DEV) up -d --build

dev-down: ## Stop the development stack
	$(COMPOSE_DEV) down

dev-logs: ## Tail development logs
	$(COMPOSE_DEV) logs -f app

test: ## Run unit tests locally
	npm test

lint: ## Run ESLint locally
	npm run lint

clean: ## Stop both stacks and delete volumes (DESTRUCTIVE)
	-$(COMPOSE) down -v
	-$(COMPOSE_DEV) down -v
