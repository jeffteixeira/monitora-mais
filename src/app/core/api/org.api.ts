import { Service, inject } from '@angular/core';

import type {
  Course,
  Department,
  InvitePreview,
  Organization,
  OrgMember,
  OrgRole,
  Reward,
  RewardKind,
  Subject,
} from '../models';
import { OrgStore } from '../org/org.store';
import { SupabaseService } from '../supabase/supabase.service';
import { unwrap } from './unwrap';

interface RawMember extends Omit<OrgMember, 'full_name' | 'bio'> {
  profile: { full_name: string; bio: string | null };
}

const toMember = ({ profile, ...rest }: RawMember): OrgMember => ({ ...rest, ...profile });
const MEMBER_COLUMNS =
  'user_id, role, xp, hours_given, rating_sum, rating_count, profile:profiles!memberships_user_id_fkey(full_name, bio)';

/** Organizações, membros e administração (catálogo/recompensas) da organização atual. */
@Service()
export class OrgApi {
  private readonly client = inject(SupabaseService).client;
  private readonly org = inject(OrgStore);

  // ---------------------------------------------------------- organizações
  async create(name: string, slug: string, description: string): Promise<Organization> {
    return unwrap(
      await this.client.rpc('create_organization', {
        p_name: name,
        p_slug: slug,
        p_description: description || undefined,
      }),
    ) as Organization;
  }

  async previewInvite(code: string): Promise<InvitePreview | null> {
    const rows = unwrap(await this.client.rpc('preview_invite', { p_code: code })) as InvitePreview[];
    return rows[0] ?? null;
  }

  async join(code: string): Promise<Organization> {
    return unwrap(await this.client.rpc('join_organization', { p_code: code })) as Organization;
  }

  async leave(orgId: string): Promise<void> {
    unwrap(await this.client.rpc('leave_organization', { p_org: orgId }));
  }

  async update(name: string, description: string, welcomeCredits: number): Promise<void> {
    unwrap(
      await this.client.rpc('update_organization', {
        p_org: this.org.requireId(),
        p_name: name,
        p_description: description,
        p_welcome_credits: welcomeCredits,
      }),
    );
  }

  async rotateInvite(): Promise<string> {
    return unwrap(
      await this.client.rpc('rotate_invite_code', { p_org: this.org.requireId() }),
    ) as string;
  }

  async grantCredits(amount: number): Promise<number> {
    return unwrap(
      await this.client.rpc('grant_semester_credits', {
        p_org: this.org.requireId(),
        p_amount: amount,
      }),
    ) as number;
  }

  async setMyCourse(courseId: string | null): Promise<void> {
    unwrap(
      await this.client.rpc('set_my_course', {
        p_org: this.org.requireId(),
        p_course: courseId ?? undefined,
      }),
    );
  }

  // ---------------------------------------------------------- membros
  async members(): Promise<OrgMember[]> {
    const rows = unwrap(
      await this.client
        .from('memberships')
        .select(MEMBER_COLUMNS)
        .eq('org_id', this.org.requireId())
        .eq('status', 'active')
        .order('joined_at')
        .overrideTypes<RawMember[], { merge: false }>(),
    );
    return rows.map(toMember);
  }

  async member(userId: string): Promise<OrgMember> {
    return toMember(
      unwrap(
        await this.client
          .from('memberships')
          .select(MEMBER_COLUMNS)
          .eq('org_id', this.org.requireId())
          .eq('user_id', userId)
          .eq('status', 'active')
          .single<RawMember>(),
      ),
    );
  }

  async setRole(userId: string, role: OrgRole): Promise<void> {
    unwrap(
      await this.client.rpc('set_member_role', {
        p_org: this.org.requireId(),
        p_user: userId,
        p_role: role,
      }),
    );
  }

  async removeMember(userId: string): Promise<void> {
    unwrap(
      await this.client.rpc('remove_member', { p_org: this.org.requireId(), p_user: userId }),
    );
  }

  // ---------------------------------------------------------- catálogo (admin)
  async addDepartment(name: string): Promise<void> {
    unwrap(await this.client.from('departments').insert({ org_id: this.org.requireId(), name }));
  }

  async deleteDepartment(id: string): Promise<void> {
    unwrap(await this.client.from('departments').delete().eq('id', id));
  }

  async addCourse(departmentId: string, name: string): Promise<void> {
    unwrap(
      await this.client
        .from('courses')
        .insert({ org_id: this.org.requireId(), department_id: departmentId, name }),
    );
  }

  async deleteCourse(id: string): Promise<void> {
    unwrap(await this.client.from('courses').delete().eq('id', id));
  }

  async addSubject(
    departmentId: string,
    code: string,
    name: string,
    difficulty: number,
  ): Promise<void> {
    unwrap(
      await this.client.from('subjects').insert({
        org_id: this.org.requireId(),
        department_id: departmentId,
        code,
        name,
        difficulty,
      }),
    );
  }

  async deleteSubject(id: string): Promise<void> {
    unwrap(await this.client.from('subjects').delete().eq('id', id));
  }

  // ---------------------------------------------------------- recompensas (admin)
  async allRewards(): Promise<(Reward & { active: boolean })[]> {
    return unwrap(
      await this.client
        .from('rewards')
        .select('*')
        .eq('org_id', this.org.requireId())
        .order('cost'),
    ) as (Reward & { active: boolean })[];
  }

  async addReward(title: string, description: string, kind: RewardKind, cost: number): Promise<void> {
    unwrap(
      await this.client
        .from('rewards')
        .insert({ org_id: this.org.requireId(), title, description, kind, cost }),
    );
  }

  async setRewardActive(id: string, active: boolean): Promise<void> {
    unwrap(await this.client.from('rewards').update({ active }).eq('id', id));
  }

  async deleteReward(id: string): Promise<void> {
    unwrap(await this.client.from('rewards').delete().eq('id', id));
  }
}

export type { Course, Department, Subject };
