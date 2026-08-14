import { response, Response } from 'express';

export class AppSucess {
  constructor(
  public  message: string,
  public  statusCode: number,
  public data: unknown | unknown[]
 
  ) {
       this.data = data;
    this.message = message;
    this.statusCode = statusCode;  
 
  }
  send(response: Response): void {

    response.status(this.statusCode).json({
      massege: this.message,
      data: this.data
    });
  }
}


// В данные классы нужно прописывать только response


export class OkSuccess extends AppSucess {
  constructor(
    public response: Response,
    data: unknown,
    message: string = 'Запрос успешно выполнен',
    statusCode: number = 200,
  ) {
    super(message, statusCode, data);
    super.send(this.response);
  }
}


export class CreatedSuccess extends AppSucess {
  constructor(
    public response: Response,
    data: unknown,
    message: string = 'Объект успешно создан',
    statusCode: number = 201,
   
  ) {
    super(message, statusCode, data);
    super.send(this.response);
  }
}



export class NoContentSuccess extends AppSucess {
  constructor(
    public response: Response,
     data: unknown,
    message: string = 'Объект успешно удален',
    statusCode: number = 204,
    
  ) {
    super(message, statusCode,data);
    super.send(this.response);
  }
}


