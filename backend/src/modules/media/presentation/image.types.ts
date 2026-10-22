import { Field, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsEnum, IsInt, IsString, MaxLength, Min } from 'class-validator';

export enum ImageTypeEnum { RECEIPT = 'RECEIPT', FOOD = 'FOOD', FRESHNESS = 'FRESHNESS', OTHER = 'OTHER' }
registerEnumType(ImageTypeEnum, { name: 'ImageType' });

@InputType()
export class RequestImageUploadInput {
  @Field({ description: 'One of IMAGE_ALLOWED_MIME, e.g. image/jpeg' }) @IsString() @MaxLength(64) mimeType!: string;
  @Field(() => Int, { description: 'Exact file size; the presigned PUT is bound to it' }) @IsInt() @Min(1) sizeBytes!: number;
}

@InputType()
export class ConfirmImageUploadInput {
  @Field() @IsString() @MaxLength(300) storageKey!: string;
  @Field(() => ImageTypeEnum) @IsEnum(ImageTypeEnum) type!: ImageTypeEnum;
}

@ObjectType()
export class ImageUploadTicketType {
  @Field() storageKey!: string;
  @Field({ description: 'HTTP PUT the raw file bytes here with the same Content-Type' }) uploadUrl!: string;
  @Field() contentType!: string;
  @Field() expiresAt!: Date;
}

@ObjectType('Image')
export class ImageObjectType {
  @Field(() => ID) id!: string;
  @Field(() => ImageTypeEnum) type!: ImageTypeEnum;
  @Field() mimeType!: string;
  @Field(() => Int) sizeBytes!: number;
  @Field({ description: 'Short-lived GET URL; re-query the image to refresh it' }) url!: string;
  @Field() urlExpiresAt!: Date;
  @Field() createdAt!: Date;
}
