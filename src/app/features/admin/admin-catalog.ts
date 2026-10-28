import { Component, computed, inject, resource, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTrash2 } from '@ng-icons/lucide';

import { ZardButtonComponent } from '@/shared/components/button';
import { ZardCardImports } from '@/shared/components/card';
import { ZardFieldImports } from '@/shared/components/field';
import { ZardInputComponent } from '@/shared/components/input';
import { ZardSelectImports } from '@/shared/components/select';
import { ZardSonnerService } from '@/shared/components/sonner';

import { CatalogApi } from '../../core/api/catalog.api';
import { OrgApi } from '../../core/api/org.api';
import { adminError } from './admin-util';

const str = (v: string | string[]): string => (typeof v === 'string' ? v : '');

@Component({
  selector: 'app-admin-catalog',
  imports: [NgIcon, ZardButtonComponent, ZardCardImports, ZardFieldImports, ZardInputComponent, ZardSelectImports],
  viewProviders: [provideIcons({ lucideTrash2 })],
  template: `
    <div class="grid gap-4 lg:grid-cols-3">
      <z-card>
        <z-card-header><z-card-title zTitle="Departamentos" /></z-card-header>
        <z-card-content class="flex flex-col gap-4">
          <ul class="flex flex-col divide-y">
            @for (d of departments.value() ?? []; track d.id) {
              <li class="flex items-center justify-between py-1.5">
                {{ d.name }}
                <button z-button zType="ghost" zSize="icon-sm" type="button" [attr.aria-label]="'Excluir ' + d.name" (click)="run(() => api.deleteDepartment(d.id))">
                  <ng-icon name="lucideTrash2" aria-hidden="true" />
                </button>
              </li>
            }
          </ul>
          <form class="flex items-end gap-2" (submit)="$event.preventDefault(); addDepartment()">
            <div z-field class="flex-1">
              <label z-field-label for="dep-name">Novo departamento</label>
              <input z-input id="dep-name" required [value]="depName()" (input)="depName.set($any($event.target).value)" />
            </div>
            <button z-button type="submit">Adicionar</button>
          </form>
        </z-card-content>
      </z-card>

      <z-card>
        <z-card-header><z-card-title zTitle="Cursos" /></z-card-header>
        <z-card-content class="flex flex-col gap-4">
          <ul class="flex flex-col divide-y">
            @for (c of courses.value() ?? []; track c.id) {
              <li class="flex items-center justify-between py-1.5">
                <span>{{ c.name }} <span class="text-xs text-muted-foreground">· {{ deptName(c.department_id) }}</span></span>
                <button z-button zType="ghost" zSize="icon-sm" type="button" [attr.aria-label]="'Excluir ' + c.name" (click)="run(() => api.deleteCourse(c.id))">
                  <ng-icon name="lucideTrash2" aria-hidden="true" />
                </button>
              </li>
            }
          </ul>
          <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); addCourse()">
            <div z-field>
              <label z-field-label for="course-dept">Departamento</label>
              <z-select id="course-dept" zPlaceholder="Selecione" [(zValue)]="courseDept">
                @for (d of departments.value() ?? []; track d.id) { <z-select-item [zValue]="d.id">{{ d.name }}</z-select-item> }
              </z-select>
            </div>
            <div z-field>
              <label z-field-label for="course-name">Novo curso</label>
              <input z-input id="course-name" required [value]="courseName()" (input)="courseName.set($any($event.target).value)" />
            </div>
            <button z-button type="submit" [zDisabled]="!courseDept()">Adicionar</button>
          </form>
        </z-card-content>
      </z-card>

      <z-card>
        <z-card-header><z-card-title zTitle="Matérias" /></z-card-header>
        <z-card-content class="flex flex-col gap-4">
          <ul class="flex max-h-72 flex-col divide-y overflow-auto">
            @for (s of subjects.value() ?? []; track s.id) {
              <li class="flex items-center justify-between py-1.5">
                <span>{{ s.name }} <span class="text-xs text-muted-foreground">· {{ s.code }}</span></span>
                <button z-button zType="ghost" zSize="icon-sm" type="button" [attr.aria-label]="'Excluir ' + s.name" (click)="run(() => api.deleteSubject(s.id))">
                  <ng-icon name="lucideTrash2" aria-hidden="true" />
                </button>
              </li>
            }
          </ul>
          <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); addSubject()">
            <div z-field>
              <label z-field-label for="sub-dept">Departamento</label>
              <z-select id="sub-dept" zPlaceholder="Selecione" [(zValue)]="subDept">
                @for (d of departments.value() ?? []; track d.id) { <z-select-item [zValue]="d.id">{{ d.name }}</z-select-item> }
              </z-select>
            </div>
            <div z-field>
              <label z-field-label for="sub-code">Código</label>
              <input z-input id="sub-code" required maxlength="12" [value]="subCode()" (input)="subCode.set($any($event.target).value)" />
            </div>
            <div z-field>
              <label z-field-label for="sub-name">Nome</label>
              <input z-input id="sub-name" required [value]="subName()" (input)="subName.set($any($event.target).value)" />
            </div>
            <div z-field>
              <label z-field-label for="sub-diff">Dificuldade</label>
              <z-select id="sub-diff" [(zValue)]="subDiff">
                <z-select-item zValue="1">Básica</z-select-item>
                <z-select-item zValue="2">Intermediária</z-select-item>
                <z-select-item zValue="3">Avançada</z-select-item>
              </z-select>
            </div>
            <button z-button type="submit" [zDisabled]="!subDept()">Adicionar</button>
          </form>
        </z-card-content>
      </z-card>
    </div>
  `,
})
export class AdminCatalog {
  protected readonly api = inject(OrgApi);
  private readonly catalog = inject(CatalogApi);
  private readonly sonner = inject(ZardSonnerService);

  protected readonly departments = resource({ loader: () => this.catalog.departments() });
  protected readonly courses = resource({ loader: () => this.catalog.courses() });
  protected readonly subjects = resource({ loader: () => this.catalog.subjects() });

  protected readonly depName = signal('');
  protected readonly courseName = signal('');
  protected readonly courseDept = signal<string | string[]>('');
  protected readonly subCode = signal('');
  protected readonly subName = signal('');
  protected readonly subDept = signal<string | string[]>('');
  protected readonly subDiff = signal<string | string[]>('2');

  private readonly deptNames = computed(
    () => new Map((this.departments.value() ?? []).map((d) => [d.id, d.name])),
  );

  protected deptName(id: string): string {
    return this.deptNames().get(id) ?? '';
  }

  protected addDepartment(): Promise<void> {
    return this.run(async () => {
      await this.api.addDepartment(this.depName().trim());
      this.depName.set('');
    });
  }

  protected addCourse(): Promise<void> {
    return this.run(async () => {
      await this.api.addCourse(str(this.courseDept()), this.courseName().trim());
      this.courseName.set('');
    });
  }

  protected addSubject(): Promise<void> {
    return this.run(async () => {
      await this.api.addSubject(
        str(this.subDept()),
        this.subCode().trim().toUpperCase(),
        this.subName().trim(),
        Number(str(this.subDiff())),
      );
      this.subCode.set('');
      this.subName.set('');
    });
  }

  protected async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
      this.departments.reload();
      this.courses.reload();
      this.subjects.reload();
    } catch (err) {
      this.sonner.error(adminError(err));
    }
  }
}
