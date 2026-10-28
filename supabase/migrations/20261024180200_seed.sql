-- Monitora+ : dados iniciais

insert into public.departments (name) values
  ('Exatas'), ('Computação'), ('Engenharias');

insert into public.courses (department_id, name)
select d.id, c.name
from (values
  ('Exatas', 'Matemática'),
  ('Exatas', 'Física'),
  ('Computação', 'Ciência da Computação'),
  ('Computação', 'Sistemas de Informação'),
  ('Engenharias', 'Engenharia Civil'),
  ('Engenharias', 'Engenharia Elétrica')
) as c (dept, name)
join public.departments d on d.name = c.dept;

insert into public.subjects (department_id, code, name, difficulty)
select d.id, s.code, s.name, s.difficulty
from (values
  ('Exatas', 'MAT101', 'Cálculo I', 3),
  ('Exatas', 'MAT102', 'Cálculo II', 3),
  ('Exatas', 'MAT110', 'Álgebra Linear', 2),
  ('Exatas', 'FIS101', 'Física I', 3),
  ('Exatas', 'EST101', 'Probabilidade e Estatística', 2),
  ('Computação', 'COM101', 'Programação I', 2),
  ('Computação', 'COM102', 'Estruturas de Dados', 3),
  ('Computação', 'COM110', 'Banco de Dados', 2),
  ('Computação', 'COM120', 'Lógica para Computação', 1),
  ('Engenharias', 'ENG101', 'Desenho Técnico', 1),
  ('Engenharias', 'ENG110', 'Circuitos Elétricos', 3)
) as s (dept, code, name, difficulty)
join public.departments d on d.name = s.dept;

insert into public.badges (code, name, description, icon) values
  ('salvador_de_vidas', 'Salvador de Vidas', 'Ajudou um aluno nas 48 horas anteriores a uma prova final.', 'life-buoy'),
  ('multidisciplinar', 'Multidisciplinar', 'Deu monitoria de 3 matérias diferentes no mesmo semestre.', 'layers'),
  ('madrugador', 'Madrugador', 'Realizou 3 monitorias no primeiro horário da manhã (antes das 8h).', 'sunrise'),
  ('pontualidade_britanica', 'Pontualidade Britânica', 'Iniciou e encerrou as últimas 5 monitorias exatamente no horário.', 'clock');

insert into public.rewards (title, description, kind, cost) values
  ('10h de atividades complementares', 'Converte 10 créditos em 10 horas de atividades complementares, com comprovante auditável para a secretaria.', 'horas_complementares', 10),
  ('5h de atividades complementares', 'Converte 5 créditos em 5 horas de atividades complementares.', 'horas_complementares', 5),
  ('Monitoria de disciplina avançada', 'Acesso prioritário a monitorias de disciplinas mais complexas do seu curso.', 'acesso', 3),
  ('Prioridade na matrícula', 'Prioridade na escolha de disciplinas no próximo período de matrícula.', 'vantagem', 8),
  ('Desconto de 20% na xerox', 'Cupom de desconto no centro de cópias do campus.', 'vantagem', 2),
  ('Cupom de livraria parceira', 'Cupom de R$ 30 em livrarias parceiras.', 'vantagem', 6);
