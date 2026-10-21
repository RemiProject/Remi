import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 50;

@ArgsType()
export class PaginationArgs {
  @Field(() => Int, { defaultValue: 20 })
  @IsInt() @Min(1) @Max(MAX_PAGE_SIZE)
  first = 20;

  @Field(() => String, { nullable: true })
  @IsOptional() @IsString()
  after?: string;
}
