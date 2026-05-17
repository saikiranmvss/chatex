CREATE TABLE `channel_subscribers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channel_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channel_subscribers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`avatar_url` text,
	`is_public` boolean NOT NULL DEFAULT true,
	`owner_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversation_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversation_id` int NOT NULL,
	`user_id` int NOT NULL,
	`role` varchar(50) NOT NULL DEFAULT 'member',
	`is_archived` boolean NOT NULL DEFAULT false,
	`is_muted` boolean NOT NULL DEFAULT false,
	`is_pinned` boolean NOT NULL DEFAULT false,
	`unread_count` int NOT NULL DEFAULT 0,
	`joined_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversation_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversation_type` enum('direct','group','channel') NOT NULL,
	`name` varchar(255),
	`description` text,
	`avatar_url` text,
	`owner_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`avatar_url` text,
	`bio` text,
	`user_status` enum('active','suspended','banned') NOT NULL DEFAULT 'active',
	`user_presence` enum('online','away','offline') NOT NULL DEFAULT 'offline',
	`user_role` enum('user','moderator','admin') NOT NULL DEFAULT 'user',
	`is_verified` boolean NOT NULL DEFAULT false,
	`last_seen_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversation_id` int NOT NULL,
	`sender_id` int NOT NULL,
	`content` text NOT NULL,
	`message_type` enum('text','image','video','audio','file','sticker','gif','system') NOT NULL DEFAULT 'text',
	`message_status` enum('sending','sent','delivered','seen') NOT NULL DEFAULT 'sent',
	`reply_to_id` int,
	`media_url` text,
	`media_type` varchar(100),
	`media_size` int,
	`media_name` varchar(255),
	`is_edited` boolean NOT NULL DEFAULT false,
	`is_pinned` boolean NOT NULL DEFAULT false,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`reactions` json NOT NULL DEFAULT ('[]'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`edited_at` timestamp,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `starred_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`message_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starred_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`actor_user_id` int,
	`notification_type` enum('message','mention','group_invite','channel_broadcast','system') NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`is_read` boolean NOT NULL DEFAULT false,
	`reference_id` int,
	`reference_type` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporter_id` int NOT NULL,
	`target_user_id` int,
	`message_id` int,
	`reason` text NOT NULL,
	`description` text,
	`report_status` enum('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blocked_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blocker_id` int NOT NULL,
	`blocked_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blocked_users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `platform_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
ALTER TABLE `channel_subscribers` ADD CONSTRAINT `channel_subscribers_channel_id_channels_id_fk` FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `channel_subscribers` ADD CONSTRAINT `channel_subscribers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `channels` ADD CONSTRAINT `channels_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD CONSTRAINT `conversation_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_sender_id_users_id_fk` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `starred_messages` ADD CONSTRAINT `starred_messages_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `starred_messages` ADD CONSTRAINT `starred_messages_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_reporter_id_users_id_fk` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_target_user_id_users_id_fk` FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_message_id_messages_id_fk` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `blocked_users` ADD CONSTRAINT `blocked_users_blocker_id_users_id_fk` FOREIGN KEY (`blocker_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `blocked_users` ADD CONSTRAINT `blocked_users_blocked_id_users_id_fk` FOREIGN KEY (`blocked_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;